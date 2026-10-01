/**
 * Core data contracts for the RFx comparison system.
 *
 * DESIGN PRINCIPLE: every extractor (xlsx/docx/pdf/image/email), regardless
 * of source format, must produce ExtractedLine[] conforming to this shape.
 * Normalization, the comparison store, the UI, and the analyst agent all
 * read/write ONLY this shape -- never raw documents again after extraction.
 * This is what makes provenance and "don't silently guess" enforceable in
 * one place instead of scattered across five format-specific code paths.
 */

export type Currency = "INR" | "USD" | "EUR" | "OTHER";

export type ConfidenceFlag =
  | "OK" // clean, high-confidence extraction, matched 1:1 to an RFx line
  | "LOW_CONFIDENCE" // extractor unsure of a value (e.g. blurry photo, vague phrasing)
  | "UNIT_MISMATCH" // vendor's unit of measure differs from the RFx spec (e.g. per box vs per unit)
  | "CURRENCY_CONVERTED" // value was converted from a non-INR currency; original preserved
  | "NOT_QUOTED" // vendor did not quote this RFx line at all
  | "UNRESOLVED_AMBIGUOUS" // vendor's response can't be decomposed to a single line (e.g. collapsed average across SKUs) -- system must NOT guess a split
  | "CONDITIONAL_PRICING"; // price depends on a condition (e.g. early-payment rebate) not yet resolved into a single number

/**
 * One line item as extracted from a single vendor's raw response, BEFORE
 * normalization. line_ref is null when the extractor could not map the
 * vendor's text to any RFx line number with confidence -- that is itself
 * a signal, not an error to hide.
 */
export interface ExtractedLine {
  vendor_id: string;
  line_ref: number | null; // maps to LineItem.no in the RFx, or null if unmapped
  raw_item_text: string; // vendor's own description, verbatim
  qty_quoted: number | null;
  unit_price: number | null;
  currency: Currency;
  unit_of_measure: string; // vendor's own wording, e.g. "per box (10)", "per unit"
  flags: ConfidenceFlag[];
  resolvable: boolean; // false => downstream must show source_excerpt, never fabricate a number
  source_excerpt: string; // verbatim quote / cell reference / OCR'd text backing this value
  source_location: string; // e.g. "Sheet1!F14", "page 2, footnote 7", "email paragraph 3", "image region (x,y,w,h)"
  extraction_confidence: number; // 0-1, model or OCR self-reported confidence
  // Present only when flags include CONDITIONAL_PRICING and the vendor's
  // condition is a simple percentage discount/rebate (e.g. "4% early-payment
  // rebate"). Extracted as a plain number so normalization can compute the
  // alternate price deterministically instead of parsing free text later.
  conditional_discount_pct: number | null;
  conditional_discount_description: string | null; // e.g. "if paid within 7 days of invoice"
}

/**
 * One line item AFTER normalization: mapped to a canonical RFx line,
 * unit/currency converted to a common basis, with the original vendor
 * figures preserved alongside for auditability.
 */
export interface NormalizedLine {
  vendor_id: string;
  line_ref: number;
  // canonical, comparable figures (INR, per-unit-of-RFx-spec)
  normalized_unit_price_inr: number | null;
  normalized_line_total_inr: number | null;
  // original vendor figures, never overwritten
  original_unit_price: number | null;
  original_currency: Currency;
  original_unit_of_measure: string;
  conversion_notes: string[]; // human-readable log of every conversion applied, e.g. "USD->INR @ 83.00 (2026-09-29)"
  flags: ConfidenceFlag[];
  resolvable: boolean;
  source_excerpt: string;
  source_location: string;
  // for CONDITIONAL_PRICING lines: both bases, buyer picks which to compare on
  alternate_basis?: {
    label: string; // e.g. "Net of 4% early-payment rebate (payment within 7 days)"
    unit_price_inr: number;
  };
}

export type QuestionnaireAnswerQuality =
  | "ANSWERED_WITH_PROOF" // e.g. certificate number, named references with contacts
  | "ANSWERED_VAGUE" // answered but no verifiable specifics
  | "ANSWERED_EVASIVE" // answered but deflects, promises to discuss later, verbal-only claim
  | "UNANSWERED";

export interface QuestionnaireAnswer {
  vendor_id: string;
  question: string;
  raw_answer: string;
  quality: QuestionnaireAnswerQuality;
  notes?: string; // e.g. "claims OEM authorization but no certificate attached"
}

export type QuestionnaireGateResult = "PASS" | "BORDERLINE" | "FAIL";

export interface VendorQuestionnaireVerdict {
  vendor_id: string;
  answers: QuestionnaireAnswer[];
  gate_result: QuestionnaireGateResult;
  gate_reasons: string[]; // which rule(s) drove the verdict -- must be traceable, not a black box
}

export interface LineItemSpec {
  no: number;
  item: string;
  spec: string;
  uom: string;
  qty: number;
}

export interface VendorMeta {
  vendor_id: string;
  full_name: string;
  contact: string;
  source_format: "xlsx" | "docx" | "pdf" | "image" | "email";
  source_file: string;
  edge_case?: string; // the deliberate "ugly edge" this response tests, shown on the landing page
}

/**
 * The comparison store: the single source of truth that the UI and the
 * analyst agent both read from. Nothing downstream of this should ever
 * re-open a raw vendor file.
 */
export interface ComparisonStore {
  rfx_id: string;
  line_items: LineItemSpec[];
  vendors: VendorMeta[];
  normalized_lines: NormalizedLine[];
  questionnaire_verdicts: VendorQuestionnaireVerdict[];
  generated_at: string;
  // Per vendor: whether this run called Claude ("live") or reused a stored
  // extraction of the identical file ("cache"). See lib/extractionCache.ts.
  extraction_sources?: Record<string, "live" | "cache">;
}
