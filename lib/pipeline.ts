import fs from "fs/promises";
import path from "path";
import { ComparisonStore, ExtractedLine, NormalizedLine, VendorQuestionnaireVerdict } from "./schema";
import { LINE_ITEMS, VENDORS, RFX_ID, QUESTIONNAIRE_RAW_ANSWERS } from "./rfxData";
import { extractFromXlsx } from "./extractors/xlsx";
import { extractFromDocx } from "./extractors/docx";
import { extractFromPdf } from "./extractors/pdf";
import { extractFromEmail } from "./extractors/email";
import { extractFromImage } from "./extractors/image";
import { normalizeLine, fillMissingLinesAsNotQuoted } from "./normalize";
import { classifyQuestionnaireAnswers, applyQuestionnaireGate } from "./questionnaire";

const UPLOADS_DIR = path.join(process.cwd(), "data", "vendor-uploads");

/**
 * Runs the full pipeline for ONE vendor: read file -> format-specific
 * extraction (real LLM/vision call) -> normalization (deterministic) ->
 * fill NOT_QUOTED gaps -> questionnaire classification + gate.
 *
 * Vendors run concurrently via Promise.allSettled in runFullPipeline, so a
 * failure in one vendor's extraction is still isolated and reported
 * per-vendor rather than taking down the whole run -- but the wall-clock
 * cost is the slowest vendor, not the sum of all five (run sequentially the
 * first real run took ~4.5 minutes, well past the route's maxDuration).
 */
export async function runVendorPipeline(
  vendorId: string
): Promise<{ normalizedLines: NormalizedLine[]; questionnaireVerdict: VendorQuestionnaireVerdict }> {
  const vendor = VENDORS.find((v) => v.vendor_id === vendorId);
  if (!vendor) throw new Error(`Unknown vendor: ${vendorId}`);

  const filePath = path.join(UPLOADS_DIR, vendor.source_file);
  const buf = await fs.readFile(filePath);

  const startedAt = Date.now();
  // Questionnaire classification doesn't depend on the price extraction, so
  // it runs alongside it rather than after it.
  const verdictPromise = (async () => {
    const rawAnswers = QUESTIONNAIRE_RAW_ANSWERS[vendorId];
    const rawAnswerPairs = Object.entries(rawAnswers).map(([question, raw_answer]) => ({
      question,
      raw_answer,
    }));
    const classified = await classifyQuestionnaireAnswers(vendorId, rawAnswerPairs);
    return applyQuestionnaireGate(vendorId, classified);
  })();
  // If extraction throws first, this promise is never awaited; mark it
  // handled so a questionnaire failure can't surface as an unhandled rejection.
  verdictPromise.catch(() => {});

  let extracted: ExtractedLine[];
  switch (vendor.source_format) {
    case "xlsx":
      extracted = await extractFromXlsx(buf, vendorId, LINE_ITEMS);
      break;
    case "docx":
      extracted = await extractFromDocx(buf, vendorId, LINE_ITEMS);
      break;
    case "pdf":
      extracted = await extractFromPdf(buf, vendorId, LINE_ITEMS);
      break;
    case "email":
      extracted = await extractFromEmail(buf.toString("utf-8"), vendorId, LINE_ITEMS);
      break;
    case "image": {
      const mediaType = vendor.source_file.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
      extracted = await extractFromImage(buf, mediaType, vendorId, LINE_ITEMS);
      break;
    }
    default:
      throw new Error(`Unsupported source format: ${vendor.source_format}`);
  }

  const lineByRef = new Map(LINE_ITEMS.map((li) => [li.no, li]));
  const normalized = extracted
    .filter((e) => e.line_ref !== null || !e.resolvable) // keep unresolved rows even without a clean line_ref
    .map((e) => {
      const spec = e.line_ref !== null ? lineByRef.get(e.line_ref) : undefined;
      // Fall back to a placeholder spec for unresolved/unmapped lines so we
      // can still surface them in the UI for human triage.
      const effectiveSpec = spec ?? { no: e.line_ref ?? -1, item: "Unmapped vendor line", spec: "", uom: "per unit", qty: 0 };
      return normalizeLine(e, effectiveSpec);
    });

  const complete = fillMissingLinesAsNotQuoted(normalized, vendor, LINE_ITEMS);

  const verdict = await verdictPromise;
  console.log(
    `[pipeline:${vendorId}] ${extracted.length} extracted rows -> ${complete.length} normalized lines, gate ${verdict.gate_result}, ${((Date.now() - startedAt) / 1000).toFixed(1)}s`
  );

  return { normalizedLines: complete, questionnaireVerdict: verdict };
}

export async function runFullPipeline(): Promise<{
  store: ComparisonStore;
  errors: { vendor_id: string; error: string }[];
}> {
  const errors: { vendor_id: string; error: string }[] = [];
  const allNormalized: NormalizedLine[] = [];
  const allVerdicts: VendorQuestionnaireVerdict[] = [];

  const results = await Promise.allSettled(VENDORS.map((v) => runVendorPipeline(v.vendor_id)));
  results.forEach((r, i) => {
    const vendor = VENDORS[i];
    if (r.status === "fulfilled") {
      allNormalized.push(...r.value.normalizedLines);
      allVerdicts.push(r.value.questionnaireVerdict);
    } else {
      const err: any = r.reason;
      console.error(`[pipeline:${vendor.vendor_id}] FAILED: ${err?.message ?? String(err)}`);
      errors.push({ vendor_id: vendor.vendor_id, error: err?.message ?? String(err) });
    }
  });

  const store: ComparisonStore = {
    rfx_id: RFX_ID,
    line_items: LINE_ITEMS,
    vendors: VENDORS,
    normalized_lines: allNormalized,
    questionnaire_verdicts: allVerdicts,
    generated_at: new Date().toISOString(),
  };

  return { store, errors };
}
