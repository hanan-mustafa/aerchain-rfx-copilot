import fs from "fs/promises";
import path from "path";
import { ProcessedResponse, QuestionnaireAnswer, RfxDefinition, VendorMeta } from "./schema";
import { SAMPLE_RFX, SAMPLE_VENDORS } from "./rfxData";
import { extractFromXlsx } from "./extractors/xlsx";
import { extractFromDocx } from "./extractors/docx";
import { extractFromPdf } from "./extractors/pdf";
import { extractFromEmail } from "./extractors/email";
import { extractFromImage } from "./extractors/image";
import { ExtractionResult } from "./extractors/shared";
import { classifyQuestionnaireAnswers } from "./questionnaire";
import { extractionCacheKey, getCacheEntry, putCacheEntry } from "./extractionCache";

export const UPLOADS_DIR = path.join(process.cwd(), "data", "vendor-uploads");

const NOT_ANSWERED = "(not answered)";

/** Picks the extractor from the file name (and MIME type when the name has no usable extension). */
export function detectFormat(fileName: string, mediaType?: string): VendorMeta["source_format"] | null {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (["xlsx", "xls", "xlsm", "csv"].includes(ext)) return "xlsx";
  if (ext === "docx") return "docx";
  if (ext === "pdf") return "pdf";
  if (["txt", "eml", "md"].includes(ext)) return "email";
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return "image";
  if (mediaType?.startsWith("image/")) return "image";
  if (mediaType === "application/pdf") return "pdf";
  if (mediaType?.startsWith("text/")) return "email";
  return null;
}

function imageMediaType(fileName: string): string {
  const ext = fileName.toLowerCase().split(".").pop();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

async function extractWithLLM(
  format: VendorMeta["source_format"],
  buf: Buffer,
  fileName: string,
  vendorId: string,
  rfx: RfxDefinition
): Promise<ExtractionResult> {
  switch (format) {
    case "xlsx":
      return extractFromXlsx(buf, vendorId, rfx);
    case "docx":
      return extractFromDocx(buf, vendorId, rfx);
    case "pdf":
      return extractFromPdf(buf, vendorId, rfx);
    case "email":
      return extractFromEmail(buf.toString("utf-8"), vendorId, rfx);
    case "image":
      return extractFromImage(buf, imageMediaType(fileName), vendorId, rfx);
  }
}

/**
 * Classifies questionnaire answers. Unanswered questions are labelled in
 * code; only answers with actual text are sent to Claude, and nothing is
 * sent at all when the response answers none of the questions.
 */
async function classifyAnswers(vendorId: string, rfx: RfxDefinition, extraction: ExtractionResult): Promise<QuestionnaireAnswer[]> {
  const rows = rfx.questionnaire.map((q) => {
    const found = extraction.answers.find((a) => a.question_id === q.id);
    const raw = found?.raw_answer?.trim() || NOT_ANSWERED;
    return {
      question_id: q.id,
      question: q.question,
      raw_answer: raw,
      source_excerpt: found?.source_excerpt || undefined,
      source_location: found?.source_location || undefined,
    };
  });
  const isUnanswered = (raw: string) => /^\(?\s*not (answered|stated)/i.test(raw);
  const toClassify = rows.filter((r) => !isUnanswered(r.raw_answer));
  const classified = toClassify.length > 0 ? await classifyQuestionnaireAnswers(vendorId, toClassify) : [];
  return rows.map(
    (r) =>
      classified.find((c) => c.question_id === r.question_id) ?? {
        vendor_id: vendorId,
        ...r,
        quality: "UNANSWERED" as const,
      }
  );
}

/**
 * Reads one vendor response document: format-specific extraction (one LLM
 * call per document; the photo extractor makes two reads and cross-checks
 * them) plus questionnaire classification. Both are skipped entirely when
 * the same document was already processed for the same RFx.
 */
export async function processResponse(params: {
  rfx: RfxDefinition;
  vendorId: string;
  fileName: string;
  buf: Buffer;
  mediaType?: string;
  useCache: boolean;
}): Promise<ProcessedResponse> {
  const { rfx, vendorId, fileName, buf, useCache } = params;
  const format = detectFormat(fileName, params.mediaType);
  if (!format) {
    throw new Error(`Unsupported file type: ${fileName}. Upload a spreadsheet, Word document, PDF, email/text file or image.`);
  }
  const startedAt = Date.now();
  const key = extractionCacheKey(rfx, format, buf);
  const cached = useCache ? await getCacheEntry(key) : null;
  if (cached) {
    console.log(`[process:${vendorId}] ${fileName}: cache hit, no API call`);
    return {
      vendor_id: vendorId,
      file_name: fileName,
      lines: cached.extraction.lines.map((l) => ({ ...l, vendor_id: vendorId })),
      answers: cached.classified_answers.map((a) => ({ ...a, vendor_id: vendorId })),
      terms: cached.extraction.terms,
      processed_at: new Date().toISOString(),
      from_cache: true,
    };
  }

  const extraction = await extractWithLLM(format, buf, fileName, vendorId, rfx);
  const answers = await classifyAnswers(vendorId, rfx, extraction);
  await putCacheEntry({
    cache_key: key,
    vendor_id: vendorId,
    file_name: fileName,
    extraction,
    classified_answers: answers,
    created_at: new Date().toISOString(),
    origin: "live-extraction",
  });
  console.log(`[process:${vendorId}] ${fileName}: extracted live, ${extraction.lines.length} lines, ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
  return {
    vendor_id: vendorId,
    file_name: fileName,
    lines: extraction.lines,
    answers,
    terms: extraction.terms,
    processed_at: new Date().toISOString(),
    from_cache: false,
  };
}

/** Processes one of the sample RFx's bundled vendor files. */
export async function processSampleResponse(vendorId: string, useCache: boolean): Promise<ProcessedResponse> {
  const vendor = SAMPLE_VENDORS.find((v) => v.vendor_id === vendorId);
  if (!vendor) throw new Error(`Unknown sample vendor: ${vendorId}`);
  const buf = await fs.readFile(path.join(UPLOADS_DIR, vendor.source_file));
  return processResponse({ rfx: SAMPLE_RFX, vendorId, fileName: vendor.source_file, buf, useCache });
}
