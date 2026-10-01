import fs from "fs/promises";
import path from "path";
import { ComparisonStore, ExtractedLine, NormalizedLine, VendorMeta, VendorQuestionnaireVerdict } from "./schema";
import { LINE_ITEMS, VENDORS, RFX_ID, QUESTIONNAIRE_RAW_ANSWERS } from "./rfxData";
import { extractFromXlsx } from "./extractors/xlsx";
import { extractFromDocx } from "./extractors/docx";
import { extractFromPdf } from "./extractors/pdf";
import { extractFromEmail } from "./extractors/email";
import { extractFromImage } from "./extractors/image";
import { normalizeLine, fillMissingLinesAsNotQuoted } from "./normalize";
import { classifyQuestionnaireAnswers, applyQuestionnaireGate } from "./questionnaire";
import { extractionCacheKey, questionnaireCacheKey, getCacheEntry, putCacheEntry } from "./extractionCache";

const UPLOADS_DIR = path.join(process.cwd(), "data", "vendor-uploads");

/**
 * Runs the full pipeline for ONE vendor: read file -> format-specific
 * extraction (real LLM/vision call, skipped when an identical file was
 * already extracted -- see lib/extractionCache.ts) -> normalization
 * (deterministic) -> fill NOT_QUOTED gaps -> questionnaire classification
 * (LLM, cached the same way) + gate (deterministic).
 *
 * Vendors run concurrently via Promise.allSettled in runFullPipeline, so a
 * failure in one vendor's extraction is still isolated and reported
 * per-vendor rather than taking down the whole run -- but the wall-clock
 * cost is the slowest vendor, not the sum of all five (run sequentially the
 * first real run took ~4.5 minutes, well past the route's maxDuration).
 */
export interface VendorPipelineOptions {
  // false = always call Claude, even for a file that has a cache entry
  // ("Re-extract live" in the UI). The fresh result replaces the entry.
  useCache: boolean;
}

async function extractWithLLM(vendor: VendorMeta, buf: Buffer): Promise<ExtractedLine[]> {
  const vendorId = vendor.vendor_id;
  switch (vendor.source_format) {
    case "xlsx":
      return extractFromXlsx(buf, vendorId, LINE_ITEMS);
    case "docx":
      return extractFromDocx(buf, vendorId, LINE_ITEMS);
    case "pdf":
      return extractFromPdf(buf, vendorId, LINE_ITEMS);
    case "email":
      return extractFromEmail(buf.toString("utf-8"), vendorId, LINE_ITEMS);
    case "image": {
      const mediaType = vendor.source_file.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
      return extractFromImage(buf, mediaType, vendorId, LINE_ITEMS);
    }
    default:
      throw new Error(`Unsupported source format: ${vendor.source_format}`);
  }
}

export async function runVendorPipeline(
  vendorId: string,
  options: VendorPipelineOptions = { useCache: true }
): Promise<{
  normalizedLines: NormalizedLine[];
  questionnaireVerdict: VendorQuestionnaireVerdict;
  source: "live" | "cache";
}> {
  const vendor = VENDORS.find((v) => v.vendor_id === vendorId);
  if (!vendor) throw new Error(`Unknown vendor: ${vendorId}`);

  const filePath = path.join(UPLOADS_DIR, vendor.source_file);
  const buf = await fs.readFile(filePath);
  const startedAt = Date.now();

  const rawAnswerPairs = Object.entries(QUESTIONNAIRE_RAW_ANSWERS[vendorId]).map(([question, raw_answer]) => ({
    question,
    raw_answer,
  }));
  const extractionKey = extractionCacheKey(vendor, buf);
  const questionnaireKey = questionnaireCacheKey(rawAnswerPairs);
  const cached = options.useCache ? await getCacheEntry(vendorId) : null;
  const extractionHit = cached?.extraction_key === extractionKey;
  const questionnaireHit = cached?.questionnaire_key === questionnaireKey;

  // The two LLM steps are independent, so a miss on both runs them in parallel.
  const classifiedPromise = questionnaireHit
    ? Promise.resolve(cached!.questionnaire_answers)
    : classifyQuestionnaireAnswers(vendorId, rawAnswerPairs);
  // If extraction throws first, this promise is never awaited; mark it
  // handled so a questionnaire failure can't surface as an unhandled rejection.
  classifiedPromise.catch(() => {});
  const extracted = extractionHit ? cached!.extracted : await extractWithLLM(vendor, buf);
  const classified = await classifiedPromise;

  if (!extractionHit || !questionnaireHit) {
    await putCacheEntry({
      vendor_id: vendorId,
      source_file: vendor.source_file,
      extraction_key: extractionKey,
      extracted,
      questionnaire_key: questionnaireKey,
      questionnaire_answers: classified,
      created_at: new Date().toISOString(),
      origin: extractionHit && cached ? cached.origin : "live-extraction",
    });
  }

  // Everything below is deterministic and runs on every request, cached or not.
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
  const verdict = applyQuestionnaireGate(vendorId, classified);
  const source = extractionHit && questionnaireHit ? "cache" : "live";
  console.log(
    `[pipeline:${vendorId}] ${source === "cache" ? "cache hit, no API call" : `live (extraction ${extractionHit ? "cached" : "called Claude"}, questionnaire ${questionnaireHit ? "cached" : "called Claude"})`}: ${extracted.length} extracted rows -> ${complete.length} normalized lines, gate ${verdict.gate_result}, ${((Date.now() - startedAt) / 1000).toFixed(1)}s`
  );

  return { normalizedLines: complete, questionnaireVerdict: verdict, source };
}

export async function runFullPipeline(options: VendorPipelineOptions = { useCache: true }): Promise<{
  store: ComparisonStore;
  errors: { vendor_id: string; error: string }[];
}> {
  const errors: { vendor_id: string; error: string }[] = [];
  const allNormalized: NormalizedLine[] = [];
  const allVerdicts: VendorQuestionnaireVerdict[] = [];
  const sources: Record<string, "live" | "cache"> = {};

  const results = await Promise.allSettled(VENDORS.map((v) => runVendorPipeline(v.vendor_id, options)));
  results.forEach((r, i) => {
    const vendor = VENDORS[i];
    if (r.status === "fulfilled") {
      allNormalized.push(...r.value.normalizedLines);
      allVerdicts.push(r.value.questionnaireVerdict);
      sources[vendor.vendor_id] = r.value.source;
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
    extraction_sources: sources,
  };

  return { store, errors };
}
