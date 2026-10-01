import { ComparisonStore, NormalizedLine } from "./schema";

/**
 * Award scenarios, computed in code from the comparison: who wins each line,
 * at what price, what the award totals, and which lines can't be covered.
 * Shared by the analyst's tools, the Award page and the award memo, so the
 * same scenario always shows the same numbers wherever it appears.
 */

export type Basis = "headline" | "best_available";
export type Eligibility = "PASS" | "PASS_BORDERLINE" | "ALL";

export interface AwardAllocation {
  line_ref: number;
  vendor_id: string;
  unit_price_inr: number;
  line_total_inr: number;
}

export interface Scenario {
  id: string;
  label: string;
  strategy: "single_vendor" | "cheapest_per_line";
  eligibility: Eligibility;
  basis: Basis;
  vendor_ids: string[]; // vendors considered
  vendors_used: string[]; // vendors that win at least one line
  total_inr: number;
  allocations: AwardAllocation[];
  uncovered_lines: number[]; // no usable price from any considered vendor
  review_lines: number[]; // awarded lines whose price carries a review flag
}

export const ELIGIBILITY_LABEL: Record<Eligibility, string> = {
  PASS: "Qualified vendors only",
  PASS_BORDERLINE: "Qualified + borderline vendors",
  ALL: "All vendors",
};

export const BASIS_LABEL: Record<Basis, string> = {
  headline: "Headline prices",
  best_available: "Net of early-payment rebates",
};

const REVIEW_FLAGS = new Set(["LOW_CONFIDENCE", "UNIT_MISMATCH", "CONDITIONAL_PRICING"]);

export function priceOn(line: NormalizedLine, basis: Basis): number | null {
  if (!line.resolvable) return null;
  if (basis === "best_available" && line.alternate_basis) return line.alternate_basis.unit_price_inr;
  return line.normalized_unit_price_inr;
}

export function eligibleVendors(store: ComparisonStore, eligibility: Eligibility): string[] {
  const ok = eligibility === "PASS" ? ["PASS"] : eligibility === "PASS_BORDERLINE" ? ["PASS", "BORDERLINE"] : null;
  return store.vendors
    .map((v) => v.vendor_id)
    .filter((id) => ok === null || ok.includes(store.questionnaire_verdicts.find((x) => x.vendor_id === id)?.gate_result ?? ""));
}

function lineOf(store: ComparisonStore, vendorId: string, lineRef: number) {
  return store.normalized_lines.find((l) => l.vendor_id === vendorId && l.line_ref === lineRef);
}

function finish(
  store: ComparisonStore,
  base: Omit<Scenario, "total_inr" | "vendors_used" | "review_lines" | "uncovered_lines" | "allocations">,
  allocations: AwardAllocation[]
): Scenario {
  const covered = new Set(allocations.map((a) => a.line_ref));
  return {
    ...base,
    allocations,
    total_inr: allocations.reduce((s, a) => s + a.line_total_inr, 0),
    vendors_used: Array.from(new Set(allocations.map((a) => a.vendor_id))),
    uncovered_lines: store.line_items.map((li) => li.no).filter((n) => !covered.has(n)),
    review_lines: allocations
      .filter((a) => lineOf(store, a.vendor_id, a.line_ref)?.flags.some((f) => REVIEW_FLAGS.has(f)))
      .map((a) => a.line_ref),
  };
}

/** Lowest usable price per line among the given vendors (ties go to the first vendor listed). */
export function cheapestPerLine(store: ComparisonStore, vendorIds: string[], basis: Basis, eligibility: Eligibility = "ALL"): Scenario {
  const allocations: AwardAllocation[] = [];
  for (const li of store.line_items) {
    let best: AwardAllocation | null = null;
    for (const vid of vendorIds) {
      const line = lineOf(store, vid, li.no);
      const price = line ? priceOn(line, basis) : null;
      if (price === null) continue;
      if (!best || price < best.unit_price_inr) {
        best = { line_ref: li.no, vendor_id: vid, unit_price_inr: price, line_total_inr: price * li.qty };
      }
    }
    if (best) allocations.push(best);
  }
  return finish(
    store,
    {
      id: `split:${eligibility}:${basis}`,
      label: `Split award, lowest price per line (${ELIGIBILITY_LABEL[eligibility].toLowerCase()})`,
      strategy: "cheapest_per_line",
      eligibility,
      basis,
      vendor_ids: vendorIds,
    },
    allocations
  );
}

/** Everything to one vendor, at that vendor's prices. Lines it didn't price stay uncovered. */
export function singleVendor(store: ComparisonStore, vendorId: string, basis: Basis): Scenario {
  const allocations: AwardAllocation[] = [];
  for (const li of store.line_items) {
    const line = lineOf(store, vendorId, li.no);
    const price = line ? priceOn(line, basis) : null;
    if (price !== null) allocations.push({ line_ref: li.no, vendor_id: vendorId, unit_price_inr: price, line_total_inr: price * li.qty });
  }
  const name = store.vendors.find((v) => v.vendor_id === vendorId)?.full_name ?? vendorId;
  const gate = store.questionnaire_verdicts.find((v) => v.vendor_id === vendorId)?.gate_result;
  return finish(
    store,
    {
      id: `single:${vendorId}:${basis}`,
      label: `Single award to ${name}`,
      strategy: "single_vendor",
      eligibility: gate === "PASS" ? "PASS" : gate === "BORDERLINE" ? "PASS_BORDERLINE" : "ALL",
      basis,
      vendor_ids: [vendorId],
    },
    allocations
  );
}

/** The scenarios a buyer typically weighs: each vendor alone, plus split awards at each eligibility level. */
export function standardScenarios(store: ComparisonStore, basis: Basis): Scenario[] {
  const splits = (["PASS", "PASS_BORDERLINE", "ALL"] as Eligibility[])
    .map((e) => ({ e, ids: eligibleVendors(store, e) }))
    .filter(({ ids }) => ids.length > 1)
    .map(({ e, ids }) => cheapestPerLine(store, ids, basis, e));
  const singles = store.vendors.map((v) => singleVendor(store, v.vendor_id, basis));
  // Drop splits identical to an earlier one (e.g. no borderline vendors).
  const seen = new Set<string>();
  const uniqueSplits = splits.filter((s) => {
    const key = s.vendor_ids.join(",");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return [...uniqueSplits, ...singles];
}
