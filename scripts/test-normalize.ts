/**
 * Sanity-checks the deterministic normalization math against synthetic
 * ExtractedLine objects shaped exactly like what the real extractors should
 * produce for the three trickiest vendor traps in the dataset. This does
 * NOT call Claude -- it's here to verify normalize.ts's arithmetic is
 * correct in isolation, before ever spending an API call on it.
 *
 * Run with: npx tsx scripts/test-normalize.ts
 */
import { normalizeLine } from "../lib/normalize";
import { ExtractedLine, LineItemSpec } from "../lib/schema";

function check(label: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"} - ${label}`);
  if (!cond) process.exitCode = 1;
}

// --- Trap 1: Sunrise Computech, Laptop Cable Lock, USD, per box of 10 ---
const cableLockLine: LineItemSpec = { no: 24, item: "Laptop Cable Lock", spec: "Keyed", uom: "per unit", qty: 300 };
const sunriseCableLock: ExtractedLine = {
  vendor_id: "sunrise",
  line_ref: 24,
  raw_item_text: "Laptop Cable Lock",
  qty_quoted: 300,
  unit_price: 114.5, // USD, per box of 10 (i.e. $11.45/unit * 10)
  currency: "USD",
  unit_of_measure: "per box (10)",
  flags: [],
  resolvable: true,
  source_excerpt: "Laptop Cable Lock ... per box (10) ... $114.50",
  source_location: "image row 24",
  extraction_confidence: 0.85,
  conditional_discount_pct: null,
  conditional_discount_description: null,
};
const normCableLock = normalizeLine(sunriseCableLock, cableLockLine);
// Expected: 114.50 USD * 83 = 9503.5 INR per box of 10 -> /10 = 950.35 INR/unit
check("Sunrise cable lock: currency converted", normCableLock.flags.includes("CURRENCY_CONVERTED"));
check("Sunrise cable lock: unit mismatch flagged", normCableLock.flags.includes("UNIT_MISMATCH"));
check(
  "Sunrise cable lock: per-unit price ~= 950.35 INR",
  normCableLock.normalized_unit_price_inr !== null &&
    Math.abs(normCableLock.normalized_unit_price_inr - 950.35) < 0.5
);
check("Sunrise cable lock: original value preserved untouched", normCableLock.original_unit_price === 114.5);

// --- Trap 2: Global IT Distributors, 4% early-payment rebate footnote ---
const monitorLine: LineItemSpec = { no: 5, item: "Monitor 24-inch FHD", spec: "IPS", uom: "per unit", qty: 200 };
const globalItMonitor: ExtractedLine = {
  vendor_id: "global_it",
  line_ref: 5,
  raw_item_text: "Monitor 24-inch FHD",
  qty_quoted: 200,
  unit_price: 10000, // INR headline
  currency: "INR",
  unit_of_measure: "per unit",
  flags: ["CONDITIONAL_PRICING"],
  resolvable: true,
  source_excerpt: "Note 7: a 4% early-payment rebate applies ... if paid within 7 days of invoice date",
  source_location: "page 1 table / page 2 footnote 7",
  extraction_confidence: 0.9,
  conditional_discount_pct: 4,
  conditional_discount_description: "if paid within 7 days of invoice date",
};
const normMonitor = normalizeLine(globalItMonitor, monitorLine);
check("Global IT monitor: headline price untouched at 10000", normMonitor.normalized_unit_price_inr === 10000);
check(
  "Global IT monitor: alternate basis computed at 9600 (4% off)",
  normMonitor.alternate_basis !== undefined && Math.abs(normMonitor.alternate_basis.unit_price_inr - 9600) < 0.01
);
check(
  "Global IT monitor: alternate basis label mentions the rebate condition",
  (normMonitor.alternate_basis?.label ?? "").includes("7 days")
);

// --- Trap 3: QuickServe, unresolved ambiguous collapsed laptop price ---
const laptopEntryLine: LineItemSpec = { no: 1, item: "Business Laptop - Entry", spec: "i5/8/256", uom: "per unit", qty: 100 };
const quickserveLaptop: ExtractedLine = {
  vendor_id: "quickserve",
  line_ref: 1,
  raw_item_text: "Laptops - all variants same as last year's rate, average around Rs 70,800",
  qty_quoted: null,
  unit_price: 70800,
  currency: "INR",
  unit_of_measure: "per unit",
  flags: ["UNRESOLVED_AMBIGUOUS"],
  resolvable: false, // <- the critical bit: extractor must mark this false
  source_excerpt: "Laptops - all variants same as last year's rate, average around Rs 70,800/- per unit",
  source_location: "paragraph 3",
  extraction_confidence: 0.4,
  conditional_discount_pct: null,
  conditional_discount_description: null,
};
const normLaptop = normalizeLine(quickserveLaptop, laptopEntryLine);
check("QuickServe collapsed laptop price: NOT normalized into a number", normLaptop.normalized_unit_price_inr === null);
check("QuickServe collapsed laptop price: resolvable stays false", normLaptop.resolvable === false);
check(
  "QuickServe collapsed laptop price: original vendor text preserved for human review",
  normLaptop.source_excerpt.includes("70,800")
);

// --- Line 30 (warranty, per device): vendor wording "per unit" vs RFx "per device" ---
const warrantyLine: LineItemSpec = { no: 30, item: "3-Year Onsite Warranty Extension", spec: "Per-device", uom: "per device", qty: 320 };
const warrantyExtracted: ExtractedLine = {
  vendor_id: "techmart",
  line_ref: 30,
  raw_item_text: "3-Year Onsite Warranty Extension (Per-device bundle, all laptops)",
  qty_quoted: 320,
  unit_price: 3390,
  currency: "INR",
  unit_of_measure: "per unit",
  flags: ["OK"],
  resolvable: true,
  source_excerpt: "3-Year Onsite Warranty Extension | 320 | 3,390",
  source_location: "table under heading 'Extended Warranty', row 1",
  extraction_confidence: 0.95,
  conditional_discount_pct: null,
  conditional_discount_description: null,
};
const normWarranty = normalizeLine(warrantyExtracted, warrantyLine);
check("Warranty per unit vs per device: price kept as-is (INR 3,390)", normWarranty.normalized_unit_price_inr === 3390);
check("Warranty per unit vs per device: not flagged UNIT_MISMATCH", !normWarranty.flags.includes("UNIT_MISMATCH"));
check("Warranty per unit vs per device: line total = 3,390 x 320", normWarranty.normalized_line_total_inr === 3390 * 320);
const normLotOnly = normalizeLine({ ...warrantyExtracted, unit_of_measure: "lot" }, warrantyLine);
check("Warranty quoted per lot vs RFx per device: left null for review, not guessed", normLotOnly.normalized_unit_price_inr === null && normLotOnly.flags.includes("UNIT_MISMATCH"));

console.log("\nDone.");
