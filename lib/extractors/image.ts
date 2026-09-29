import { ExtractedLine, LineItemSpec } from "../schema";
import { claude, MODEL } from "../claude";
import {
  buildExtractionSystemPrompt,
  parseExtractionResponse,
  ExtractionResponseWire,
} from "./shared";

/**
 * DESIGN NOTE on cross-checking a photographed source:
 *
 * The obvious idea is "run OCR (tesseract) alongside the vision model and
 * flag disagreements." We deliberately did NOT wire in a native-binary OCR
 * engine here: tesseract's native binary is a poor fit for Vercel's
 * serverless functions (large binary, cold-start cost, platform-specific
 * builds), and tesseract.js's WASM build adds meaningful bundle size and
 * latency for a demo-scale deployment. Rather than fake a cross-check by
 * calling it "OCR" when it isn't, we do something we can actually stand
 * behind: TWO INDEPENDENT vision extraction passes (differently-worded
 * prompts that read the card in opposite orders), and treat any per-line
 * disagreement between them -- price, unit of measure, or a line only one
 * pass saw -- as a real, automatic LOW_CONFIDENCE signal. This is a smaller
 * safety net than true OCR cross-validation, and that trade-off belongs in
 * the one-pager, not hidden: measured on the Sunrise photo, both passes of
 * an older model made the SAME misread (698.80 -> 608.80), which no
 * same-model self-consistency check can catch. Model accuracy (see
 * MODEL.vision in lib/claude.ts) is the first line of defense; this
 * cross-check is the second.
 */

async function visionExtractPass(
  base64Image: string,
  mediaType: string,
  vendorId: string,
  lineItems: LineItemSpec[],
  passLabel: string
): Promise<ExtractedLine[]> {
  const system = buildExtractionSystemPrompt(lineItems);
  // The photo is tilted, so the item-name column sits visibly higher than
  // the numbers of the same row. The QTY column is the anchor that ties a
  // row together: it is printed on the same slanted line as that row's
  // UNIT and PRICE, and every RFx line's required qty is known. The two
  // passes read the card in genuinely different orders so a row-pairing
  // slip in one is less likely to repeat in the other.
  const alignmentNote = `The photo is tilted: each printed row slopes, so an item name on the left \
sits noticeably HIGHER than the qty/unit/price printed for that same row on the right. Do not pair \
columns by horizontal pixel height. Instead, tie each row together by its QTY value (qty, unit and \
price for one row lie on the same slanted line, and the RFx line list above gives each line's \
required qty), and double-check that the UNIT (e.g. "per box (10)") you attach to an item really \
belongs to that item's row.`;
  const passInstruction =
    passLabel === "A"
      ? `${alignmentNote} Read the rate card top to bottom, row by row.`
      : `${alignmentNote} Read the rate card bottom to top. First list every (QTY, UNIT, PRICE) triple from the numeric columns, then match each triple to an item name using the QTY anchor, and only then map items to RFx lines.`;

  const res = await claude().messages.create({
    model: MODEL.vision,
    max_tokens: 16000,
    // Older models take temperature 0 for repeatability; claude-sonnet-5-5
    // and later reject non-default sampling parameters with a 400.
    ...(MODEL.vision.startsWith("claude-sonnet-4") ? { temperature: 0 } : {}),
    system: system,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType as any, data: base64Image },
          },
          {
            type: "text",
            text: `This is a PHOTOGRAPH of a printed vendor rate card (taken at an angle, on a \
phone). It may be tilted, slightly blurry, or have uneven lighting. ${passInstruction} Where \
text is genuinely hard to make out, lower extraction_confidence and add "LOW_CONFIDENCE" rather \
than guessing a clean-looking number. Use approximate position in the image (e.g. "row 12, near \
top-right") as source_location since there are no cell references. Output ONLY the JSON object \
described in your instructions.`,
          },
        ],
      },
    ],
  });

  const textBlock = res.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(`Vision pass ${passLabel} returned no text block (stop_reason: ${res.stop_reason}).`);
  }
  const jsonText = textBlock.text.replace(/```json|```/g, "").trim();
  return parseExtractionResponse(jsonText, vendorId);
}

export async function extractFromImage(
  buf: Buffer,
  mediaType: string,
  vendorId: string,
  lineItems: LineItemSpec[]
): Promise<ExtractedLine[]> {
  const base64Image = buf.toString("base64");

  const [passA, passB] = await Promise.all([
    visionExtractPass(base64Image, mediaType, vendorId, lineItems, "A"),
    visionExtractPass(base64Image, mediaType, vendorId, lineItems, "B"),
  ]);

  // Reconcile: for each line_ref present in pass A, check pass B's value.
  // Price disagreement beyond 2%, or a different unit of measure -> force LOW_CONFIDENCE and keep pass A's value
  // (arbitrary but consistent tie-break), with both readings logged in
  // source_excerpt so a human can see the discrepancy.
  const byRefB = new Map(passB.filter((l) => l.line_ref !== null).map((l) => [l.line_ref, l]));

  const disagreements: string[] = [];
  const reconciled: ExtractedLine[] = passA.map((lineA) => {
    if (lineA.line_ref === null) return lineA;
    const lineB = byRefB.get(lineA.line_ref);
    if (!lineB) return lineA;
    // Both reads agree the vendor declined this line; how each described the
    // missing unit ("N/A" vs "not stated") is not a disagreement.
    if (lineA.flags.includes("NOT_QUOTED") && lineB.flags.includes("NOT_QUOTED")) return lineA;
    const reasons: string[] = [];
    if (lineA.unit_price !== null && lineB.unit_price !== null) {
      const diff = Math.abs(lineA.unit_price - lineB.unit_price);
      const pctDiff = diff / Math.max(lineA.unit_price, lineB.unit_price, 1);
      if (pctDiff > 0.02) reasons.push(`price ${lineB.unit_price} vs ${lineA.unit_price}`);
    } else if ((lineA.unit_price === null) !== (lineB.unit_price === null)) {
      reasons.push(`price ${lineB.unit_price} vs ${lineA.unit_price}`);
    }
    // A misread unit (per unit vs per box of 10) is a 10x error even when
    // both passes read the same price, so it counts as a disagreement too.
    const uomA = lineA.unit_of_measure.trim().toLowerCase();
    const uomB = lineB.unit_of_measure.trim().toLowerCase();
    if (uomA !== uomB) reasons.push(`unit "${lineB.unit_of_measure}" vs "${lineA.unit_of_measure}"`);
    if (reasons.length === 0) return lineA;
    disagreements.push(`line ${lineA.line_ref}: ${reasons.join(", ")}`);
    return {
      ...lineA,
      flags: Array.from(new Set([...lineA.flags, "LOW_CONFIDENCE" as const])),
      extraction_confidence: Math.min(lineA.extraction_confidence, 0.5),
      source_excerpt: `${lineA.source_excerpt} [CROSS-CHECK DISAGREEMENT: independent re-read of this image got ${reasons.join(", ")} -- flagged for manual review]`,
    };
  });

  // A line only one pass saw is itself a disagreement: keep it (so it is
  // not silently turned into NOT_QUOTED) but flag it for review.
  const refsA = new Set(passA.map((l) => l.line_ref));
  const flagOnePass = (l: ExtractedLine, seenBy: string): ExtractedLine =>
    l.flags.includes("NOT_QUOTED")
      ? l
      : {
          ...l,
          flags: Array.from(new Set([...l.flags, "LOW_CONFIDENCE" as const])),
          extraction_confidence: Math.min(l.extraction_confidence, 0.5),
          source_excerpt: `${l.source_excerpt} [CROSS-CHECK: only ${seenBy} of two independent reads found this line -- flagged for manual review]`,
        };
  const onlyInA: number[] = [];
  for (let i = 0; i < reconciled.length; i++) {
    const ref = reconciled[i].line_ref;
    if (ref !== null && !byRefB.has(ref)) {
      onlyInA.push(ref);
      reconciled[i] = flagOnePass(reconciled[i], "pass A");
    }
  }
  const onlyInBLines = passB.filter((l) => l.line_ref !== null && !refsA.has(l.line_ref));
  const onlyInB = onlyInBLines.map((l) => l.line_ref);
  reconciled.push(...onlyInBLines.map((l) => flagOnePass(l, "pass B")));

  console.log(
    `[image:${vendorId}] dual-pass reconciliation: pass A ${passA.length} rows, pass B ${passB.length} rows, ` +
      `${disagreements.length} disagreement(s)${disagreements.length ? ` (${disagreements.join("; ")})` : ""}` +
      `${onlyInA.length ? `; only in A: ${onlyInA.join(",")}` : ""}${onlyInB.length ? `; only in B: ${onlyInB.join(",")}` : ""}`
  );

  return reconciled;
}
