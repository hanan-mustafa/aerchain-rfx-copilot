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
 * behind: TWO INDEPENDENT vision extraction passes (temperature 0 and a
 * differently-worded prompt), and treat any per-line disagreement between
 * them as a real, automatic LOW_CONFIDENCE signal. This is a smaller
 * safety net than true OCR cross-validation, and that trade-off belongs in
 * the one-pager, not hidden.
 */

async function visionExtractPass(
  base64Image: string,
  mediaType: string,
  vendorId: string,
  lineItems: LineItemSpec[],
  passLabel: string
): Promise<ExtractedLine[]> {
  const system = buildExtractionSystemPrompt(lineItems);
  const passInstruction =
    passLabel === "A"
      ? "Read the rate card top to bottom, row by row."
      : "Read the rate card once for the item list, then once more focused only on the numeric columns (qty, unit, price) to double check each figure before finalizing your answer.";

  const res = await claude().messages.create({
    model: MODEL.vision,
    max_tokens: 8192,
    temperature: 0,
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
    throw new Error(`Vision pass ${passLabel} returned no text block.`);
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
  // Disagreement beyond 2% -> force LOW_CONFIDENCE and keep pass A's value
  // (arbitrary but consistent tie-break), with both readings logged in
  // source_excerpt so a human can see the discrepancy.
  const byRefB = new Map(passB.filter((l) => l.line_ref !== null).map((l) => [l.line_ref, l]));

  const reconciled: ExtractedLine[] = passA.map((lineA) => {
    if (lineA.line_ref === null) return lineA;
    const lineB = byRefB.get(lineA.line_ref);
    if (!lineB || lineA.unit_price === null || lineB.unit_price === null) return lineA;
    const diff = Math.abs(lineA.unit_price - lineB.unit_price);
    const pctDiff = diff / Math.max(lineA.unit_price, lineB.unit_price, 1);
    if (pctDiff > 0.02) {
      return {
        ...lineA,
        flags: Array.from(new Set([...lineA.flags, "LOW_CONFIDENCE" as const])),
        extraction_confidence: Math.min(lineA.extraction_confidence, 0.5),
        source_excerpt: `${lineA.source_excerpt} [CROSS-CHECK DISAGREEMENT: independent re-read of this image got ${lineB.unit_price} vs ${lineA.unit_price} -- flagged for manual review]`,
      };
    }
    return lineA;
  });

  return reconciled;
}
