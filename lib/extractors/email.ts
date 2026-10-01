import { RfxDefinition } from "../schema";
import { askForJSON } from "../claude";
import { buildExtractionSystemPrompt, parseExtractionResponse, ExtractionResult } from "./shared";

/**
 * Plain text needs no format-specific pre-processing, but this is the
 * extractor most likely to hit rule #2 in the shared prompt (one price
 * covering several RFx lines, e.g. "all laptop variants, average around
 * Rs X"). That's handled centrally in the shared prompt/schema, not here --
 * this file just passes the raw text through with paragraph numbering so
 * source_location can point at "paragraph 2" etc.
 */
export async function extractFromEmail(
  text: string,
  vendorId: string,
  rfx: RfxDefinition
): Promise<ExtractionResult> {
  const paragraphs = text.split(/\n\s*\n/).map((p, i) => `[paragraph ${i + 1}] ${p.trim()}`);
  const numbered = paragraphs.join("\n\n");

  const system = buildExtractionSystemPrompt(rfx);
  const user = `Here is the vendor's email reply, with paragraphs numbered for you to cite as \
source_location. This vendor is known to write casually and may skip items, use approximate \
language ("around Rs X"), or quote one price across multiple RFx lines at once -- follow rule #2 \
in your instructions exactly in that case (do not invent a per-line split):\n\n${numbered}`;
  const jsonText = await askForJSON({ system, user, maxTokens: 8192 });
  return parseExtractionResponse(jsonText, vendorId);
}
