import {
  ExtractedLine,
  NormalizedLine,
  LineItemSpec,
  VendorMeta,
  ConfidenceFlag,
} from "./schema";

/**
 * DESIGN PRINCIPLE: currency conversion and unit-of-measure math are
 * ARITHMETIC, not judgment calls -- so they run in plain deterministic code,
 * never inside an LLM call. The LLM's job (in the extractors) was only to
 * correctly IDENTIFY that a value needs conversion; the actual division/
 * multiplication happens here, once, auditable, with the rate/factor used
 * logged next to every converted number.
 */

// Exchange rate used for this RFx cycle. In a real system this would be
// pulled from a rates service and stamped with a timestamp at RFx issue
// time (so all vendor comparisons use one frozen rate, not whatever the
// market rate is at the moment each vendor's email happens to arrive).
export const FX_RATES: Record<string, number> = {
  USD: 83.0,
  EUR: 90.0,
  INR: 1.0,
};
export const FX_RATE_DATE = "2026-09-29"; // stamped at RFx issue, frozen for this cycle

/**
 * Parses vendor unit-of-measure strings like "per box (10)", "per box of 10",
 * "per pack of 5", "per unit", "each" into a multiplier: the number of
 * RFx-spec units contained in one vendor-quoted unit.
 *
 * Returns null when the pattern isn't recognized -- callers MUST treat null
 * as "cannot safely normalize" and leave the line for human review rather
 * than assuming a multiplier of 1.
 */
export function parseUnitMultiplier(vendorUom: string, rfxUom: string): number | null {
  const v = vendorUom.trim().toLowerCase();
  const r = rfxUom.trim().toLowerCase();

  if (v === r || v === "per unit" || v === "each" || v === "per piece") {
    return 1;
  }

  const boxMatch = v.match(/per\s+box(?:\s*\(\s*(\d+)\s*\)|\s+of\s+(\d+))/);
  if (boxMatch) {
    const n = boxMatch[1] || boxMatch[2];
    return n ? parseInt(n, 10) : null;
  }
  const packMatch = v.match(/per\s+pack(?:\s*\(\s*(\d+)\s*\)|\s+of\s+(\d+))/);
  if (packMatch) {
    const n = packMatch[1] || packMatch[2];
    return n ? parseInt(n, 10) : null;
  }
  const lotMatch = v.match(/^lot$/);
  if (lotMatch && r === "lot") return 1;

  return null; // unrecognized pattern -- do not guess
}

export function normalizeLine(
  extracted: ExtractedLine,
  lineSpec: LineItemSpec
): NormalizedLine {
  const flags = new Set<ConfidenceFlag>(extracted.flags);
  const conversionNotes: string[] = [];

  // --- Unresolvable lines: pass through untouched, never fabricate a number ---
  if (!extracted.resolvable || extracted.line_ref === null) {
    return {
      vendor_id: extracted.vendor_id,
      line_ref: extracted.line_ref ?? lineSpec.no,
      normalized_unit_price_inr: null,
      normalized_line_total_inr: null,
      original_unit_price: extracted.unit_price,
      original_currency: extracted.currency,
      original_unit_of_measure: extracted.unit_of_measure,
      conversion_notes: ["Not normalized: vendor response is ambiguous/unresolvable for this line -- see source_excerpt."],
      flags: Array.from(flags),
      resolvable: false,
      source_excerpt: extracted.source_excerpt,
      source_location: extracted.source_location,
    };
  }

  let price = extracted.unit_price;

  // --- Currency conversion (deterministic) ---
  if (price !== null && extracted.currency !== "INR") {
    const rate = FX_RATES[extracted.currency];
    if (rate === undefined) {
      flags.add("LOW_CONFIDENCE");
      conversionNotes.push(
        `Currency ${extracted.currency} has no configured FX rate -- left unconverted, needs manual handling.`
      );
      price = null;
    } else {
      const original = price;
      price = price * rate;
      flags.add("CURRENCY_CONVERTED");
      conversionNotes.push(
        `${extracted.currency} ${original.toFixed(2)} x ${rate.toFixed(2)} (rate as of ${FX_RATE_DATE}) = INR ${price.toFixed(2)}`
      );
    }
  }

  // --- Unit-of-measure conversion (deterministic) ---
  if (price !== null) {
    const multiplier = parseUnitMultiplier(extracted.unit_of_measure, lineSpec.uom);
    if (extracted.unit_of_measure.trim().toLowerCase() !== lineSpec.uom.trim().toLowerCase()) {
      flags.add("UNIT_MISMATCH");
      if (multiplier === null) {
        conversionNotes.push(
          `Vendor UoM "${extracted.unit_of_measure}" does not match RFx UoM "${lineSpec.uom}" and could not be auto-converted -- needs manual review.`
        );
        price = null; // do not guess a conversion factor
      } else if (multiplier !== 1) {
        const perUnit = price / multiplier;
        conversionNotes.push(
          `Vendor quoted ${extracted.unit_of_measure} at INR ${price.toFixed(2)}; divided by ${multiplier} to get RFx-spec (${lineSpec.uom}) price of INR ${perUnit.toFixed(2)}.`
        );
        price = perUnit;
      }
    }
  }

  const lineTotal = price !== null ? price * lineSpec.qty : null;

  // --- Conditional pricing: compute the alternate (e.g. rebate-adjusted) basis ---
  // This runs on the fully-converted INR unit price so a rebate applies to
  // the SAME normalized figure the buyer is comparing across vendors, not
  // to the vendor's original pre-conversion/pre-unit-fix number.
  let alternateBasis: NormalizedLine["alternate_basis"] = undefined;
  if (
    price !== null &&
    flags.has("CONDITIONAL_PRICING") &&
    extracted.conditional_discount_pct !== null
  ) {
    const pct = extracted.conditional_discount_pct;
    const discountedPrice = price * (1 - pct / 100);
    const desc = extracted.conditional_discount_description ?? `${pct}% discount`;
    alternateBasis = {
      label: `Net of ${pct}% rebate (${desc})`,
      unit_price_inr: discountedPrice,
    };
    conversionNotes.push(
      `Conditional pricing: headline INR ${price.toFixed(2)} x (1 - ${pct}%) = INR ${discountedPrice.toFixed(2)} if condition is met (${desc}). Buyer must choose which basis to compare on -- both are shown, neither is picked automatically.`
    );
  } else if (flags.has("CONDITIONAL_PRICING") && extracted.conditional_discount_pct === null) {
    // Flagged as conditional but not a simple percentage we can compute --
    // surface the raw condition text and force a human look rather than
    // silently treating the headline price as final.
    flags.add("LOW_CONFIDENCE");
    conversionNotes.push(
      `Conditional pricing detected but the condition isn't a simple stated percentage -- could not compute an alternate basis automatically. See source_excerpt for the vendor's exact wording; needs manual review.`
    );
  }

  return {
    vendor_id: extracted.vendor_id,
    line_ref: extracted.line_ref,
    normalized_unit_price_inr: price,
    normalized_line_total_inr: lineTotal,
    original_unit_price: extracted.unit_price,
    original_currency: extracted.currency,
    original_unit_of_measure: extracted.unit_of_measure,
    conversion_notes: conversionNotes,
    flags: Array.from(flags),
    resolvable: true,
    source_excerpt: extracted.source_excerpt,
    source_location: extracted.source_location,
    alternate_basis: alternateBasis,
  };
}

/**
 * After normalizing whatever a vendor DID quote, diff against the full RFx
 * line list and materialize explicit NOT_QUOTED rows for anything missing.
 * A missing line should be a visible, flagged fact in the comparison store
 * -- not an absence that the UI has to remember to check for separately.
 */
export function fillMissingLinesAsNotQuoted(
  normalizedLines: NormalizedLine[],
  vendor: VendorMeta,
  allLineItems: LineItemSpec[]
): NormalizedLine[] {
  const quotedRefs = new Set(normalizedLines.map((l) => l.line_ref));
  const missing: NormalizedLine[] = allLineItems
    .filter((li) => !quotedRefs.has(li.no))
    .map((li) => ({
      vendor_id: vendor.vendor_id,
      line_ref: li.no,
      normalized_unit_price_inr: null,
      normalized_line_total_inr: null,
      original_unit_price: null,
      original_currency: "INR",
      original_unit_of_measure: li.uom,
      conversion_notes: [],
      flags: ["NOT_QUOTED"],
      resolvable: false,
      source_excerpt: `${vendor.full_name}'s response does not mention this line item.`,
      source_location: "n/a",
    }));
  return [...normalizedLines, ...missing];
}
