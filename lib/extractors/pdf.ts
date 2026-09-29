import pdf from "pdf-parse";
import { ExtractedLine, LineItemSpec } from "../schema";
import { askForJSON } from "../claude";
import { buildExtractionSystemPrompt, parseExtractionResponse } from "./shared";

/**
 * Text-layer extraction, not OCR/vision -- this is a native PDF (reportlab
 * output), so the text layer is exact. We tag page breaks explicitly
 * because this is precisely the vendor whose real discount is disclosed in
 * a footnote on a LATER page than the price table -- the model needs to see
 * page boundaries to connect "Note 7" back to the table on page 1.
 */
export async function extractFromPdf(
  buf: Buffer,
  vendorId: string,
  lineItems: LineItemSpec[]
): Promise<ExtractedLine[]> {
  const data = await pdf(buf);
  // pdf-parse gives us the full text with \f (form feed) page breaks in
  // most PDFs produced by reportlab/libreoffice; make page numbers explicit
  // to help the model's source_location output.
  const pages = data.text.split("\f");
  const tagged = pages
    .map((p, i) => `=== PAGE ${i + 1} ===\n${p.trim()}`)
    .join("\n\n");

  const system = buildExtractionSystemPrompt(lineItems);
  const user = `Here is the vendor's PDF quotation, with page boundaries marked. Pay close \
attention to footnotes/notes sections -- they may materially change a price shown earlier in \
the document (e.g. a rebate or condition disclosed only in a numbered note on a later page). \
If a headline price is conditional on something explained elsewhere in the document, connect \
the two and flag "CONDITIONAL_PRICING", quoting the actual footnote text in source_excerpt and \
citing both the table location and the footnote's page/note number in source_location:\n\n${tagged}`;
  const jsonText = await askForJSON({ system, user, maxTokens: 8192 });
  return parseExtractionResponse(jsonText, vendorId);
}
