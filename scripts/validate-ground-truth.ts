/**
 * Cross-checks a comparison store (default data/seed/comparison-store.json,
 * the validated sample run) against data/Ground_Truth_Answer_Key_INTERNAL.xlsx.
 *
 *   npx tsx scripts/validate-ground-truth.ts
 *
 * Per vendor per line, compares the normalized INR unit price (and, for
 * Global IT, the rebate-adjusted alternate_basis) with the answer key, and
 * checks that AMBIGUOUS / NOT QUOTED cells came through as unresolved rather
 * than as a number. Also prints the questionnaire gate vs the expected tier.
 */
import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import { ComparisonStore, NormalizedLine } from "../lib/schema";
import { FX_RATES } from "../lib/normalize";

// Defaults to the committed snapshot; pass a path to check another store, e.g. one
// exported from the app after a live re-process.
const STORE_PATH = process.argv[2] ?? path.join(process.cwd(), "data", "seed", "comparison-store.json");
const GT_PATH = path.join(process.cwd(), "data", "Ground_Truth_Answer_Key_INTERNAL.xlsx");

// Column order in the "Per-Vendor Unit Prices" sheet.
const VENDOR_COLUMNS = ["apex", "techmart", "global_it", "quickserve", "sunrise"];
const EXPECTED_GATE: Record<string, string[]> = {
  apex: ["PASS"],
  techmart: ["BORDERLINE"],
  global_it: ["FAIL"],
  quickserve: ["FAIL"],
  sunrise: ["FAIL"],
};
// Cells where the answer key contradicts the vendor's own document. Kept as
// an explicit, commented override rather than editing the INTERNAL xlsx.
const KEY_ERRATA: Record<string, string> = {
  // Key says "USD 38.55" (that is line 7's price). The rate card has no line
  // 30 row; its footer says the warranty extension will be "quoted
  // separately after laptop brand/model is finalized".
  "sunrise:30": "NOT QUOTED",
};
const TOLERANCE = 0.005; // 0.5% -- covers the key's own rounding of USD->INR

type Expected =
  | { kind: "price"; inr: number; net_inr?: number }
  | { kind: "ambiguous" }
  | { kind: "not_quoted" };

function num(s: string): number {
  return parseFloat(s.replace(/,/g, ""));
}

function parseCell(cell: string): Expected {
  const c = cell.trim();
  if (c.startsWith("AMBIGUOUS")) return { kind: "ambiguous" };
  if (c.startsWith("NOT QUOTED")) return { kind: "not_quoted" };
  const headlineNet = c.match(/^INR ([\d,.]+) headline \/ INR ([\d,.]+) net/);
  if (headlineNet) return { kind: "price", inr: num(headlineNet[1]), net_inr: num(headlineNet[2]) };
  const usdPerUnit = c.match(/^USD ([\d,.]+)\/unit equiv/);
  if (usdPerUnit) return { kind: "price", inr: num(usdPerUnit[1]) * FX_RATES.USD };
  const usd = c.match(/^USD ([\d,.]+)/);
  if (usd) return { kind: "price", inr: num(usd[1]) * FX_RATES.USD };
  const inr = c.match(/^INR ([\d,.]+)/);
  if (inr) return { kind: "price", inr: num(inr[1]) };
  throw new Error(`Unrecognized ground-truth cell: "${cell}"`);
}

function close(a: number | null | undefined, b: number): boolean {
  return a !== null && a !== undefined && Math.abs(a - b) / b <= TOLERANCE;
}

function main() {
  if (!fs.existsSync(STORE_PATH)) {
    console.error(`No store at ${STORE_PATH} -- pass the path to a comparison store JSON.`);
    process.exit(1);
  }
  const store: ComparisonStore = JSON.parse(fs.readFileSync(STORE_PATH, "utf-8"));
  const wb = XLSX.read(fs.readFileSync(GT_PATH), { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets["Per-Vendor Unit Prices"], { header: 1, blankrows: false });

  let totalFailures = 0;
  for (const [ci, vendorId] of VENDOR_COLUMNS.entries()) {
    const failures: string[] = [];
    const vendorLines = store.normalized_lines.filter((l) => l.vendor_id === vendorId);
    if (vendorLines.length === 0) {
      console.log(`\n### ${vendorId}: NO LINES IN STORE (extraction failed?)`);
      totalFailures++;
      continue;
    }
    for (const row of rows.slice(1)) {
      const lineRef = row[0] as number;
      const expected = parseCell(KEY_ERRATA[`${vendorId}:${lineRef}`] ?? String(row[3 + ci]));
      const got: NormalizedLine[] = vendorLines.filter((l) => l.line_ref === lineRef);
      const line = got[0];
      const tag = `line ${lineRef}`;
      if (got.length > 1) failures.push(`${tag}: ${got.length} rows for one line`);
      if (!line) {
        failures.push(`${tag}: missing from store`);
        continue;
      }
      if (expected.kind === "price") {
        if (!close(line.normalized_unit_price_inr, expected.inr)) {
          failures.push(
            `${tag}: expected INR ${expected.inr.toFixed(2)}, got ${line.normalized_unit_price_inr?.toFixed(2) ?? "null"} [${line.flags.join(",")}] ${line.conversion_notes.join(" / ")}`
          );
        }
        if (expected.net_inr !== undefined) {
          if (!line.flags.includes("CONDITIONAL_PRICING")) failures.push(`${tag}: missing CONDITIONAL_PRICING flag`);
          if (!close(line.alternate_basis?.unit_price_inr, expected.net_inr)) {
            failures.push(`${tag}: expected net INR ${expected.net_inr}, got alternate_basis ${line.alternate_basis?.unit_price_inr?.toFixed(2) ?? "none"}`);
          }
        }
      } else if (expected.kind === "ambiguous") {
        if (line.resolvable || !line.flags.includes("UNRESOLVED_AMBIGUOUS") || line.normalized_unit_price_inr !== null) {
          failures.push(`${tag}: expected unresolved UNRESOLVED_AMBIGUOUS, got resolvable=${line.resolvable} price=${line.normalized_unit_price_inr} [${line.flags.join(",")}]`);
        }
      } else {
        if (!line.flags.includes("NOT_QUOTED") || line.normalized_unit_price_inr !== null) {
          failures.push(`${tag}: expected NOT_QUOTED, got price=${line.normalized_unit_price_inr} [${line.flags.join(",")}]`);
        }
      }
    }
    const stray = vendorLines.filter((l) => l.line_ref < 1 || l.line_ref > 30);
    for (const s of stray) failures.push(`unmapped row line_ref=${s.line_ref}: ${s.source_excerpt.slice(0, 80)}`);

    const verdict = store.questionnaire_verdicts.find((v) => v.vendor_id === vendorId);
    const gate = verdict?.gate_result ?? "MISSING";
    const gateOk = EXPECTED_GATE[vendorId].includes(gate);
    if (!gateOk) failures.push(`questionnaire gate ${gate}, expected ${EXPECTED_GATE[vendorId].join("/")}: ${verdict?.gate_reasons.join(" ")}`);

    const flagCounts: Record<string, number> = {};
    for (const l of vendorLines) for (const f of l.flags) flagCounts[f] = (flagCounts[f] ?? 0) + 1;
    console.log(`\n### ${vendorId}: ${failures.length === 0 ? "PASS" : `${failures.length} FAIL`}  (gate ${gate}; flags ${JSON.stringify(flagCounts)})`);
    for (const f of failures) console.log(`  - ${f}`);
    totalFailures += failures.length;
  }
  console.log(`\n${totalFailures === 0 ? "ALL CHECKS PASS" : `${totalFailures} check(s) failed`}`);
  process.exit(totalFailures === 0 ? 0 : 1);
}

main();
