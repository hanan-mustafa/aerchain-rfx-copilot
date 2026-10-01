import crypto from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { ExtractedLine, QuestionnaireAnswer, VendorMeta } from "./schema";
import { MODEL } from "./claude";
import { LINE_ITEMS } from "./rfxData";
import { buildExtractionSystemPrompt } from "./extractors/shared";

/**
 * Content-addressed cache of the LLM steps only (price extraction and
 * questionnaire classification). A vendor file that has already been
 * processed is not sent to Claude again: if the cache key matches, the
 * stored ExtractedLine[] / classifications are reused. Normalization and
 * the questionnaire gate are deterministic code and always re-run, so a
 * change to normalize.ts or the gate rule still takes effect on a cached
 * run.
 *
 * The key covers everything that changes what Claude would return: the
 * file's exact bytes, the model id, and the shared extraction prompt
 * (which embeds the RFx line list). Each extractor's own per-format
 * instructions and pre-processing are not hashed automatically --
 * BUMP EXTRACTION_CACHE_VERSION whenever lib/extractors/*.ts or the
 * classifier prompt in lib/questionnaire.ts changes, or old entries will
 * keep being served.
 *
 * Storage: data/extraction-cache/<vendor_id>.json is committed (so a fresh
 * deploy needs no API credits for the demo files). On Vercel new entries go
 * to os.tmpdir() since the deployment filesystem is read-only.
 */
export const EXTRACTION_CACHE_VERSION = 1;

export interface ExtractionCacheEntry {
  vendor_id: string;
  source_file: string;
  extraction_key: string;
  extracted: ExtractedLine[];
  questionnaire_key: string;
  questionnaire_answers: QuestionnaireAnswer[]; // LLM classifications, before the gate rule
  created_at: string;
  // "live-extraction": written straight from Claude's output.
  // "reconstructed-from-validated-run": rebuilt from data/seed (see
  // scripts/seed-extraction-cache.ts), verified to normalize to that run exactly.
  origin: "live-extraction" | "reconstructed-from-validated-run";
}

const COMMITTED_DIR = path.join(process.cwd(), "data", "extraction-cache");
const RUNTIME_DIR = process.env.VERCEL ? path.join(os.tmpdir(), "extraction-cache") : COMMITTED_DIR;

function sha256(data: string | Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

export function extractionCacheKey(vendor: VendorMeta, fileBuf: Buffer): string {
  return sha256(
    JSON.stringify({
      version: EXTRACTION_CACHE_VERSION,
      file: sha256(fileBuf),
      format: vendor.source_format,
      model: vendor.source_format === "image" ? MODEL.vision : MODEL.extraction,
      system_prompt: sha256(buildExtractionSystemPrompt(LINE_ITEMS)),
    })
  );
}

export function questionnaireCacheKey(rawAnswers: { question: string; raw_answer: string }[]): string {
  return sha256(JSON.stringify({ version: EXTRACTION_CACHE_VERSION, model: MODEL.extraction, answers: rawAnswers }));
}

async function readEntry(dir: string, vendorId: string): Promise<ExtractionCacheEntry | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(dir, `${vendorId}.json`), "utf-8"));
  } catch (err: any) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

/** Newest entry for a vendor: a runtime write wins over the committed one. */
export async function getCacheEntry(vendorId: string): Promise<ExtractionCacheEntry | null> {
  return (await readEntry(RUNTIME_DIR, vendorId)) ?? (RUNTIME_DIR === COMMITTED_DIR ? null : await readEntry(COMMITTED_DIR, vendorId));
}

export async function putCacheEntry(entry: ExtractionCacheEntry): Promise<void> {
  await fs.mkdir(RUNTIME_DIR, { recursive: true });
  await fs.writeFile(path.join(RUNTIME_DIR, `${entry.vendor_id}.json`), JSON.stringify(entry, null, 2), "utf-8");
}
