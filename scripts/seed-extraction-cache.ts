/**
 * Builds the committed extraction cache for the sample RFx's five vendor
 * files, so the sample runs with zero API calls -- then proves the cache is
 * faithful by processing every sample file through the real pipeline with
 * NO API key set and checking the comparison matches the validated run.
 *
 *   npx tsx scripts/seed-extraction-cache.ts
 *
 * Sources:
 *  - prices: data/seed/comparison-store.json, the run validated against the
 *    answer key (scripts/validate-ground-truth.ts). Every field normalization
 *    reads is recoverable from it; fields it never reads (raw_item_text,
 *    qty_quoted, extraction_confidence) get placeholders.
 *  - questionnaire answers + their quality labels: the dataset's test data
 *    (lib/rfxData.ts SAMPLE_QUESTIONNAIRE_ANSWERS) and the validated run's
 *    classifications.
 *  - commercial terms: transcribed from the vendor files (SAMPLE_COMMERCIAL_TERMS).
 * Entries are marked origin "reconstructed-from-validated-run"; a live
 * re-process replaces them with Claude's raw output.
 */
import fs from "fs";
import path from "path";
import { ComparisonStore, ExtractedLine, NormalizedLine } from "../lib/schema";
import {
  LINE_ITEMS,
  SAMPLE_RFX,
  SAMPLE_VENDORS,
  SAMPLE_QUESTIONNAIRE,
  SAMPLE_QUESTIONNAIRE_ANSWERS,
  SAMPLE_COMMERCIAL_TERMS,
} from "../lib/rfxData";
import { extractionCacheKey, putCacheEntry } from "../lib/extractionCache";

const SEED_PATH = path.join(process.cwd(), "data", "seed", "comparison-store.json");
const CACHE_DIR = path.join(process.cwd(), "data", "extraction-cache");
const UPLOADS_DIR = path.join(process.cwd(), "data", "vendor-uploads");

function isBackfilledNotQuoted(l: NormalizedLine): boolean {
  // Rows fillMissingLinesAsNotQuoted adds for lines the vendor never mentioned;
  // they were not extracted, so they don't belong in the extraction cache.
  return l.flags.includes("NOT_QUOTED") && l.source_location === "n/a" && l.conversion_notes.length === 0;
}

function toExtracted(l: NormalizedLine): ExtractedLine {
  const rebate = l.alternate_basis?.label.match(/^Net of ([\d.]+)% rebate \((.*)\)$/);
  return {
    vendor_id: l.vendor_id,
    line_ref: l.line_ref,
    raw_item_text: LINE_ITEMS.find((li) => li.no === l.line_ref)?.item ?? "",
    qty_quoted: null,
    unit_price: l.original_unit_price,
    currency: l.original_currency,
    unit_of_measure: l.original_unit_of_measure,
    // Normalization only ever adds flags to a set seeded from these, in order.
    flags: l.flags,
    resolvable: l.resolvable,
    source_excerpt: l.source_excerpt,
    source_location: l.source_location,
    extraction_confidence: l.flags.includes("LOW_CONFIDENCE") ? 0.5 : 0.9,
    conditional_discount_pct: rebate ? parseFloat(rebate[1]) : null,
    conditional_discount_description: rebate ? rebate[2] : null,
  };
}

async function main() {
  const seed: ComparisonStore = JSON.parse(fs.readFileSync(SEED_PATH, "utf-8"));
  // Old (v1, per-vendor) entries are superseded by content-addressed v2 entries.
  for (const f of fs.existsSync(CACHE_DIR) ? fs.readdirSync(CACHE_DIR) : []) fs.unlinkSync(path.join(CACHE_DIR, f));

  for (const vendor of SAMPLE_VENDORS) {
    const verdict = seed.questionnaire_verdicts.find((v) => v.vendor_id === vendor.vendor_id);
    if (!verdict) throw new Error(`Seed store has no questionnaire verdict for ${vendor.vendor_id}`);
    const buf = fs.readFileSync(path.join(UPLOADS_DIR, vendor.source_file));
    const rawAnswers = SAMPLE_QUESTIONNAIRE_ANSWERS[vendor.vendor_id];
    await putCacheEntry(
      {
        cache_key: extractionCacheKey(SAMPLE_RFX, vendor.source_format, buf),
        vendor_id: vendor.vendor_id,
        file_name: vendor.source_file,
        extraction: {
          lines: seed.normalized_lines.filter((l) => l.vendor_id === vendor.vendor_id && !isBackfilledNotQuoted(l)).map(toExtracted),
          answers: SAMPLE_QUESTIONNAIRE.map((q) => ({
            question_id: q.id,
            raw_answer: rawAnswers[q.id] ?? "(not answered)",
            source_excerpt: rawAnswers[q.id] ?? "",
            source_location: "Vendor questionnaire response",
          })),
          terms: SAMPLE_COMMERCIAL_TERMS[vendor.vendor_id] ?? [],
        },
        classified_answers: verdict.answers.map((a) => ({
          ...a,
          question_id: SAMPLE_QUESTIONNAIRE.find((q) => q.question === a.question)?.id,
          source_excerpt: a.raw_answer,
          source_location: "Vendor questionnaire response",
        })),
        created_at: seed.generated_at,
        origin: "reconstructed-from-validated-run",
      },
      CACHE_DIR
    );
    console.log(`wrote cache entry for ${vendor.vendor_id} (${vendor.source_file})`);
  }

  // Verify through the real code path, cache only. With the key removed,
  // any Claude call throws -- a pass also proves no API call is made.
  delete process.env.ANTHROPIC_API_KEY;
  const { processSampleResponse } = await import("../lib/pipeline");
  const { buildComparison } = await import("../lib/comparison");
  const responses: Record<string, any> = {};
  for (const v of SAMPLE_VENDORS) {
    responses[v.vendor_id] = await processSampleResponse(v.vendor_id, true);
    if (!responses[v.vendor_id].from_cache) throw new Error(`${v.vendor_id} was not served from cache`);
  }
  const store = buildComparison(SAMPLE_RFX, SAMPLE_VENDORS, responses);

  if (JSON.stringify(store.normalized_lines) !== JSON.stringify(seed.normalized_lines)) {
    throw new Error("Cached prices do NOT reproduce the validated run -- do not commit this cache.");
  }
  for (const v of seed.questionnaire_verdicts) {
    const now = store.questionnaire_verdicts.find((x) => x.vendor_id === v.vendor_id)!;
    const sameQuality = JSON.stringify(v.answers.map((a) => a.quality)) === JSON.stringify(now.answers.map((a) => a.quality));
    if (now.gate_result !== v.gate_result || !sameQuality) {
      throw new Error(`Questionnaire result changed for ${v.vendor_id}: ${v.gate_result} -> ${now.gate_result}`);
    }
  }
  // Refresh the seed snapshot with the fields the current schema adds (RFx, terms, files).
  fs.writeFileSync(SEED_PATH, JSON.stringify({ ...store, generated_at: seed.generated_at }, null, 2));
  console.log("\nVERIFIED: cached run (no API key) reproduces the validated prices and qualification results exactly.");
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
