import { z } from "zod";
import { ExtractedLine, ConfidenceFlag, LineItemSpec } from "../schema";

// Schema Claude's JSON output must match, per extracted line. Kept close to
// ExtractedLine but as a wire format (strings for enums) so we can validate
// with zod before trusting anything into the store.
export const ExtractedLineWire = z.object({
  line_ref: z.number().nullable(),
  raw_item_text: z.string(),
  qty_quoted: z.number().nullable(),
  unit_price: z.number().nullable(),
  currency: z.enum(["INR", "USD", "EUR", "OTHER"]),
  unit_of_measure: z.string(),
  flags: z.array(
    z.enum([
      "OK",
      "LOW_CONFIDENCE",
      "UNIT_MISMATCH",
      "CURRENCY_CONVERTED",
      "NOT_QUOTED",
      "UNRESOLVED_AMBIGUOUS",
      "CONDITIONAL_PRICING",
    ])
  ),
  resolvable: z.boolean(),
  source_excerpt: z.string(),
  source_location: z.string(),
  extraction_confidence: z.number().min(0).max(1),
  conditional_discount_pct: z.number().min(0).max(100).nullable(),
  conditional_discount_description: z.string().nullable(),
});

export const ExtractionResponseWire = z.object({
  lines: z.array(ExtractedLineWire),
});

export function buildExtractionSystemPrompt(lineItems: LineItemSpec[]): string {
  const rfxTable = lineItems
    .map((li) => `${li.no}. ${li.item} (${li.spec}) - UoM: ${li.uom}, Qty required: ${li.qty}`)
    .join("\n");

  return `You are a procurement data extraction engine. You read a vendor's RFx response, \
in whatever format and structure it arrives, and extract EVERY price/line-item you find into \
strict JSON. You do not normalize units or convert currency -- that happens in a later step. \
Your only job is faithful, literal extraction plus honest flagging of anything unclear.

THE BUYER'S RFx LINE ITEMS (for you to map vendor text onto by line_ref):
${rfxTable}

RULES (violating these is a serious error):
1. Map each vendor price to the RFx line number (line_ref) it corresponds to, using your judgment \
about the item description. If you cannot confidently map a vendor's text to any single RFx line, \
set line_ref to null and explain why in source_excerpt -- do NOT guess a line number.
2. If a vendor gives ONE price covering MULTIPLE RFx lines (e.g. one "average" price for several \
laptop tiers) and does not provide a way to split it, you MUST NOT invent a per-line breakdown. \
Emit ONE line with line_ref set to the FIRST of the covered RFx line numbers, resolvable=false, \
flags including "UNRESOLVED_AMBIGUOUS", and quote the vendor's actual words in source_excerpt.
3. If a vendor's price is stated as INR/USD/EUR, record it as given in "currency" and "unit_price" \
literally as quoted. Do not convert currency yourself.
4. If a vendor's unit_of_measure differs from the RFx's stated UoM for that line (e.g. vendor says \
"per box of 10" but RFx wants "per unit"), record the vendor's unit_of_measure EXACTLY as they wrote \
it, and add the flag "UNIT_MISMATCH". Do not do the math yourself.
5. If a price is conditional (e.g. only applies with early payment, or is a "headline" price with a \
rebate mentioned elsewhere), extract the headline price, add flag "CONDITIONAL_PRICING", and put the \
full condition text in source_excerpt. If the condition is a simple percentage discount/rebate off \
the headline price, ALSO set conditional_discount_pct to that percentage as a plain number (e.g. 4 \
for "4%") and conditional_discount_description to a short phrase describing the condition (e.g. "if \
paid within 7 days of invoice"). If there is no such condition, or the condition is not a simple \
percentage (e.g. a volume tier or a different SKU-dependent discount), set both to null -- do not \
guess a percentage that was not stated.
6. If an RFx line is simply never mentioned by the vendor, do not emit a row for it at all (the \
normalization step will mark missing lines as NOT_QUOTED by diffing against the full RFx list).
7. source_excerpt must be a real, verbatim (or near-verbatim for OCR/scanned text) quote or \
description of where this number came from -- never write something like "as stated". This is the \
buyer's audit trail back to the original document.
8. source_location should say roughly WHERE in the document this came from (cell reference, page \
and paragraph/footnote number, email paragraph, approximate position in an image).
9. extraction_confidence is YOUR honest 0-1 confidence in this specific value, considering source \
quality (e.g. a skewed low-resolution photo warrants lower confidence than a clean spreadsheet cell). \
Confidence below 0.6 should also carry the "LOW_CONFIDENCE" flag.
10. Output ONLY valid JSON matching this exact shape, nothing else, no commentary, no markdown fences:
{"lines": [{"line_ref": number|null, "raw_item_text": string, "qty_quoted": number|null, \
"unit_price": number|null, "currency": "INR"|"USD"|"EUR"|"OTHER", "unit_of_measure": string, \
"flags": string[], "resolvable": boolean, "source_excerpt": string, "source_location": string, \
"extraction_confidence": number, "conditional_discount_pct": number|null, \
"conditional_discount_description": string|null}]}`;
}

export function parseExtractionResponse(
  jsonText: string,
  vendorId: string
): ExtractedLine[] {
  const parsed = ExtractionResponseWire.parse(JSON.parse(jsonText));
  return parsed.lines.map((l) => ({
    vendor_id: vendorId,
    line_ref: l.line_ref,
    raw_item_text: l.raw_item_text,
    qty_quoted: l.qty_quoted,
    unit_price: l.unit_price,
    currency: l.currency,
    unit_of_measure: l.unit_of_measure,
    flags: l.flags as ConfidenceFlag[],
    resolvable: l.resolvable,
    source_excerpt: l.source_excerpt,
    source_location: l.source_location,
    extraction_confidence: l.extraction_confidence,
    conditional_discount_pct: l.conditional_discount_pct,
    conditional_discount_description: l.conditional_discount_description,
  }));
}
