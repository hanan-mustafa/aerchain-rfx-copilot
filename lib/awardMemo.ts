import { ComparisonStore } from "./schema";
import { BASIS_LABEL, Scenario, standardScenarios } from "./award";
import type { AwardDecision } from "./workspace";

/**
 * The award memo: a printable record of the decision, built in code from the
 * comparison data -- no AI involved. Every awarded line cites the vendor's
 * own wording and where it appears, so the decision can be audited.
 */

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export function buildAwardMemoHtml(store: ComparisonStore, decision: AwardDecision): string {
  const rfx = store.rfx!;
  const name = (id: string) => store.vendors.find((v) => v.vendor_id === id)?.full_name ?? id;
  const lineSpec = (no: number) => store.line_items.find((l) => l.no === no);
  const line = (vid: string, no: number) => store.normalized_lines.find((l) => l.vendor_id === vid && l.line_ref === no);
  const byVendor = Array.from(new Set(decision.allocations.map((a) => a.vendor_id))).map((vid) => {
    const allocs = decision.allocations.filter((a) => a.vendor_id === vid);
    return { vid, lines: allocs.length, value: allocs.reduce((s, a) => s + a.line_total_inr, 0) };
  });
  const alternatives: Scenario[] = standardScenarios(store, decision.basis);
  const reviewed = decision.allocations.filter((a) => line(a.vendor_id, a.line_ref)?.flags.some((f) => ["LOW_CONFIDENCE", "UNIT_MISMATCH", "CONDITIONAL_PRICING"].includes(f)));

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Award memo ${esc(rfx.rfx_id)}</title>
<style>
  :root { --ink:#1c1b19; --dim:#6b6862; --line:#d8d5cc; --accent:#1f4b4b; }
  body { font-family: Inter, -apple-system, Segoe UI, sans-serif; color: var(--ink); margin: 0; background: #fff; font-size: 12.5px; line-height: 1.5; }
  main { max-width: 900px; margin: 0 auto; padding: 36px 28px 60px; }
  h1 { font-size: 22px; margin: 0; } h2 { font-size: 14px; margin: 26px 0 8px; border-bottom: 1px solid var(--line); padding-bottom: 4px; }
  .dim { color: var(--dim); } .mono { font-family: "IBM Plex Mono", ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  table { width: 100%; border-collapse: collapse; } th, td { text-align: left; padding: 5px 6px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: .03em; color: var(--dim); }
  .num { text-align: right; white-space: nowrap; } .cite { color: var(--dim); font-size: 11px; }
  .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 18px; }
  .summary div { border: 1px solid var(--line); border-radius: 6px; padding: 10px 12px; } .summary b { display: block; font-size: 17px; }
  .bar { display:flex; justify-content:space-between; align-items:center; gap: 12px; }
  .print { background: var(--accent); color: #fff; border: 0; border-radius: 6px; padding: 8px 14px; font: inherit; cursor: pointer; }
  @media print { .print { display: none; } main { padding: 0; } }
</style></head><body><main>
<div class="bar"><div class="dim">${esc(rfx.buyer_org)} · Award memo</div><button class="print" onclick="window.print()">Print / save as PDF</button></div>
<h1 style="margin-top:10px">${esc(rfx.title)}</h1>
<div class="dim mono">${esc(rfx.rfx_id)} · approved ${esc(new Date(decision.approved_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }))} by ${esc(decision.approved_by)}</div>

<div class="summary">
  <div><span class="dim">Award value</span><b class="mono">${inr(decision.total_inr)}</b></div>
  <div><span class="dim">Vendors awarded</span><b>${byVendor.length}</b></div>
  <div><span class="dim">Lines covered</span><b>${decision.allocations.length} of ${store.line_items.length}</b></div>
</div>

<h2>Decision</h2>
<p><b>${esc(decision.scenario_label)}</b><br><span class="dim">${esc(decision.eligibility)} · ${esc(BASIS_LABEL[decision.basis])}</span></p>
<p style="white-space:pre-wrap">${esc(decision.rationale)}</p>
${decision.uncovered_lines.length ? `<p><b>Not awarded:</b> line${decision.uncovered_lines.length > 1 ? "s" : ""} ${decision.uncovered_lines.join(", ")} (no usable price from an eligible vendor). These need a separate sourcing decision.</p>` : ""}

<h2>Award by vendor</h2>
<table><thead><tr><th>Vendor</th><th>Qualification</th><th class="num">Lines</th><th class="num">Value (INR)</th></tr></thead><tbody>
${byVendor.map((v) => `<tr><td>${esc(name(v.vid))}</td><td>${esc(store.questionnaire_verdicts.find((x) => x.vendor_id === v.vid)?.gate_result ?? "")}</td><td class="num">${v.lines}</td><td class="num mono">${inr(v.value)}</td></tr>`).join("")}
</tbody></table>

<h2>Alternatives considered</h2>
<table><thead><tr><th>Scenario</th><th class="num">Lines covered</th><th class="num">Total (INR)</th></tr></thead><tbody>
${alternatives.map((s) => `<tr${s.id === decision.scenario_id ? ' style="font-weight:600"' : ""}><td>${esc(s.label)}${s.id === decision.scenario_id ? " (selected)" : ""}</td><td class="num">${s.allocations.length} of ${store.line_items.length}</td><td class="num mono">${inr(s.total_inr)}</td></tr>`).join("")}
</tbody></table>

<h2>Qualification</h2>
<table><thead><tr><th>Vendor</th><th>Result</th><th>Reason</th></tr></thead><tbody>
${store.questionnaire_verdicts.map((v) => `<tr><td>${esc(name(v.vendor_id))}</td><td>${esc(v.gate_result)}</td><td>${esc(v.gate_reasons.join(" "))}</td></tr>`).join("")}
</tbody></table>

${reviewed.length ? `<h2>Awarded prices with caveats</h2><table><thead><tr><th>Line</th><th>Vendor</th><th>Caveat</th></tr></thead><tbody>${reviewed
    .map((a) => {
      const l = line(a.vendor_id, a.line_ref)!;
      return `<tr><td>${a.line_ref}. ${esc(lineSpec(a.line_ref)?.item)}</td><td>${esc(name(a.vendor_id))}</td><td>${esc(l.flags.filter((f) => f !== "OK").join(", ").toLowerCase().replace(/_/g, " "))}${l.alternate_basis ? ` · ${esc(l.alternate_basis.label)}` : ""}</td></tr>`;
    })
    .join("")}</tbody></table>` : ""}

<h2>Line allocation and evidence</h2>
<table><thead><tr><th>#</th><th>Item</th><th class="num">Qty</th><th>Vendor</th><th class="num">Unit (INR)</th><th class="num">Total (INR)</th></tr></thead><tbody>
${store.line_items
    .map((li) => {
      const a = decision.allocations.find((x) => x.line_ref === li.no);
      if (!a) return `<tr><td>${li.no}</td><td>${esc(li.item)}</td><td class="num">${li.qty}</td><td colspan="3" class="dim">Not awarded</td></tr>`;
      const l = line(a.vendor_id, li.no);
      return `<tr><td>${li.no}</td><td>${esc(li.item)}<div class="cite">“${esc(l?.source_excerpt)}” — ${esc(l?.source_location)}${l?.conversion_notes.length ? ` · ${esc(l.conversion_notes.join(" "))}` : ""}</div></td><td class="num">${li.qty}</td><td>${esc(name(a.vendor_id))}</td><td class="num mono">${inr(a.unit_price_inr)}</td><td class="num mono">${inr(a.line_total_inr)}</td></tr>`;
    })
    .join("")}
<tr><td></td><td><b>Total</b></td><td></td><td></td><td></td><td class="num mono"><b>${inr(decision.total_inr)}</b></td></tr>
</tbody></table>
<p class="dim" style="margin-top:24px">Prices are in INR per RFx unit of measure. Foreign-currency quotes are converted at the exchange rate fixed for this RFx; unit conversions (e.g. per box of 10) are shown next to each affected line.</p>
</main></body></html>`;
}

export function openAwardMemo(store: ComparisonStore, decision: AwardDecision) {
  const blob = new Blob([buildAwardMemoHtml(store, decision)], { type: "text/html" });
  window.open(URL.createObjectURL(blob), "_blank", "noopener");
}
