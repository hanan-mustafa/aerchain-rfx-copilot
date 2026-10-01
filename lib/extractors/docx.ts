import mammoth from "mammoth";
import { RfxDefinition } from "../schema";
import { askForJSON } from "../claude";
import { buildExtractionSystemPrompt, parseExtractionResponse, ExtractionResult } from "./shared";

/**
 * mammoth converts to structured HTML rather than plain text so that table
 * boundaries and headings survive -- this matters here specifically because
 * TechMart's quote groups items by their OWN category headings (not the
 * buyer's line numbers) with per-category tables. Losing that structure
 * would make the vendor's own organization invisible to the model.
 */
export async function extractFromDocx(
  buf: Buffer,
  vendorId: string,
  rfx: RfxDefinition
): Promise<ExtractionResult> {
  const { value: html } = await mammoth.convertToHtml({ buffer: buf });
  const system = buildExtractionSystemPrompt(rfx);
  const user = `Here is the vendor's Word document, converted to HTML (tables and headings \
preserved so you can see how THEY organized it -- note it may not follow the buyer's line \
numbering at all). Use heading/table position (e.g. "table under heading 'Compute (Laptops & \
Ultrabooks)', row 2") as source_location since there are no cell references in a Word doc:\n\n${html}`;
  const jsonText = await askForJSON({ system, user, maxTokens: 8192 });
  return parseExtractionResponse(jsonText, vendorId);
}
