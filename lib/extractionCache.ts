import crypto from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { QuestionnaireAnswer, RfxDefinition, VendorMeta } from "./schema";
import { MODEL } from "./claude";
import { buildExtractionSystemPrompt, ExtractionResult } from "./extractors/shared";

/**
 * Content-addressed cache of the LLM steps (document extraction and
 * questionnaire-answer classification). A document that has already been
 * processed against the same RFx is never sent to Claude again. Building
 * the comparison (normalization, gate) is pure code and always re-runs.
 *
 * The key covers what changes Claude's answer: the file's exact bytes, its
 * format, the model id, and the extraction prompt (which embeds the RFx's
 * line items and questionnaire). Each extractor's own per-format
 * instructions are not hashed automatically -- BUMP EXTRACTION_CACHE_VERSION
 * when lib/extractors/*.ts or the classifier prompt in lib/questionnaire.ts
 * changes.
 *
 * Storage: data/extraction-cache/<key>.json is committed (the sample RFx
 * runs with zero API calls on a fresh deploy); new entries go to
 * os.tmpdir() on Vercel, where the deployment filesystem is read-only.
 */
export const EXTRACTION_CACHE_VERSION = 2;

export interface ExtractionCacheEntry {
  cache_key: string;
  vendor_id: string; // vendor the document was first processed for (informational)
  file_name: string;
  extraction: ExtractionResult;
  classified_answers: QuestionnaireAnswer[];
  created_at: string;
  // "live-extraction": Claude's output. "reconstructed-from-validated-run":
  // rebuilt from the validated sample run (scripts/seed-extraction-cache.ts).
  origin: "live-extraction" | "reconstructed-from-validated-run";
}

const COMMITTED_DIR = path.join(process.cwd(), "data", "extraction-cache");
const RUNTIME_DIR = process.env.VERCEL ? path.join(os.tmpdir(), "extraction-cache") : COMMITTED_DIR;

export function sha256(data: string | Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

export function extractionCacheKey(rfx: RfxDefinition, format: VendorMeta["source_format"], fileBuf: Buffer): string {
  return sha256(
    JSON.stringify({
      version: EXTRACTION_CACHE_VERSION,
      file: sha256(fileBuf),
      format,
      model: format === "image" ? MODEL.vision : MODEL.extraction,
      system_prompt: sha256(buildExtractionSystemPrompt(rfx)),
    })
  ).slice(0, 32);
}

async function readEntry(dir: string, key: string): Promise<ExtractionCacheEntry | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(dir, `${key}.json`), "utf-8"));
  } catch (err: any) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

export async function getCacheEntry(key: string): Promise<ExtractionCacheEntry | null> {
  return (await readEntry(RUNTIME_DIR, key)) ?? (RUNTIME_DIR === COMMITTED_DIR ? null : await readEntry(COMMITTED_DIR, key));
}

export async function putCacheEntry(entry: ExtractionCacheEntry, dir: string = RUNTIME_DIR): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${entry.cache_key}.json`), JSON.stringify(entry, null, 2), "utf-8");
}
