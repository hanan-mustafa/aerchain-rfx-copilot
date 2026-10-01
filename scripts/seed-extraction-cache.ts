/**
 * Builds data/extraction-cache/*.json from data/seed/comparison-store.json
 * (the validated run that passes scripts/validate-ground-truth.ts), so the
 * demo's five files are served without any Claude call -- then proves the
 * cache is faithful by re-running the real pipeline from it with NO API key
 * set and checking the result is identical to the seed store.
 *
 *   npx tsx scripts/seed-extraction-cache.ts
 *
 * Why reconstruct instead of caching a live run: the seed store is the run
 * that was validated against the answer key, and the cache was added after
 * it. Every field normalization reads is recoverable from the normalized
 * store (original price/currency/unit, flags, resolvable, excerpt,
 * location, rebate % from alternate_basis). Fields normalization never reads
 * (raw_item_text, qty_quoted, extraction_confidence) are filled with
 * placeholders, and entries are marked origin "reconstructed-from-validated-run".
 * The next "Re-extract live" (POST /api/extract?fresh=1) replaces them with
 * Claude's raw output.
 */
import fs from "fs";
import path from "path";
import { ComparisonStore, ExtractedLine, NormalizedLine } from "../lib/schema";
import { LINE_ITEMS, VENDORS, QUESTIONNAIRE_RAW_ANSWERS } from "../lib/rfxData";
import { extractionCacheKey, questionnaireCacheKey, ExtractionCacheEntry } from "../lib/extractionCache";

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
    // Feeding the stored flags back is safe: normalization only ever adds
    // flags to a set seeded from these, in the same order.
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
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  for (const vendor of VENDORS) {
    const verdict = seed.questionnaire_verdicts.find((v) => v.vendor_id === vendor.vendor_id);
    if (!verdict) throw new Error(`Seed store has no questionnaire verdict for ${vendor.vendor_id}`);
    const rawAnswerPairs = Object.entries(QUESTIONNAIRE_RAW_ANSWERS[vendor.vendor_id]).map(([question, raw_answer]) => ({
      question,
      raw_answer,
    }));
    const entry: ExtractionCacheEntry = {
      vendor_id: vendor.vendor_id,
      source_file: vendor.source_file,
      extraction_key: extractionCacheKey(vendor, fs.readFileSync(path.join(UPLOADS_DIR, vendor.source_file))),
      extracted: seed.normalized_lines
        .filter((l) => l.vendor_id === vendor.vendor_id && !isBackfilledNotQuoted(l))
        .map(toExtracted),
      questionnaire_key: questionnaireCacheKey(rawAnswerPairs),
      questionnaire_answers: verdict.answers,
      created_at: seed.generated_at,
      origin: "reconstructed-from-validated-run",
    };
    fs.writeFileSync(path.join(CACHE_DIR, `${vendor.vendor_id}.json`), JSON.stringify(entry, null, 2));
    console.log(`wrote ${vendor.vendor_id}: ${entry.extracted.length} extracted rows, ${entry.questionnaire_answers.length} answers`);
  }

  // Verify: the real pipeline, cache only. With the key removed, any Claude
  // call throws, so a pass here also proves the cached path makes no API call.
  delete process.env.ANTHROPIC_API_KEY;
  const { runFullPipeline } = await import("../lib/pipeline");
  const { store, errors } = await runFullPipeline({ useCache: true });
  if (errors.length > 0) throw new Error(`Pipeline errors on cached run: ${JSON.stringify(errors)}`);
  const strip = (s: ComparisonStore) => JSON.stringify({ ...s, generated_at: null, extraction_sources: null });
  const notCached = Object.entries(store.extraction_sources ?? {}).filter(([, src]) => src !== "cache");
  if (notCached.length > 0) throw new Error(`Not served from cache: ${JSON.stringify(notCached)}`);
  if (strip(store) !== strip(seed)) {
    throw new Error("Cached run does NOT reproduce the seed store exactly -- do not commit this cache.");
  }
  console.log("\nVERIFIED: cached pipeline run (no API key) reproduces data/seed/comparison-store.json exactly.");
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
