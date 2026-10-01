"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRfxFromRoute } from "@/lib/useRfx";
import { AwardDecision, useComparison } from "@/lib/workspace";
import { Basis, BASIS_LABEL, ELIGIBILITY_LABEL, Scenario, standardScenarios } from "@/lib/award";
import { openAwardMemo } from "@/lib/awardMemo";
import { downloadXlsx } from "@/lib/downloads";
import { formatDate, formatInr } from "@/lib/rfxStatus";
import { ComparisonStore } from "@/lib/schema";

export default function AwardPage() {
  const { id, entry, ws } = useRfxFromRoute();
  const store = useComparison(entry);
  const [basis, setBasis] = useState<Basis>("headline");
  const [selected, setSelected] = useState<string | null>(null);
  const [rationale, setRationale] = useState("");
  const [approver, setApprover] = useState("Procurement lead");
  const [ack, setAck] = useState(false);
  const scenarios = useMemo(() => (store ? standardScenarios(store, basis) : []), [store, basis]);
  if (!entry) return null;

  if (!store) {
    return (
      <div className="empty">
        Award options appear once vendor responses are in.{" "}
        <Link href={`/rfx/${encodeURIComponent(id)}/vendors`}>Go to vendors &amp; responses</Link>
      </div>
    );
  }

  if (entry.award) return <AwardedView store={store} decision={entry.award} onReopen={() => {
    if (window.confirm("Reopen this RFx? The recorded award decision will be removed.")) {
      ws.update(entry.rfx.rfx_id, (r) => ({ ...r, award: undefined, status: "open" }));
    }
  }} />;

  const fullCover = scenarios.filter((s) => s.uncovered_lines.length === 0);
  const lowest = fullCover.length ? Math.min(...fullCover.map((s) => s.total_inr)) : null;
  const chosen = scenarios.find((s) => s.id === selected) ?? null;
  const name = (vid: string) => store.vendors.find((v) => v.vendor_id === vid)?.full_name ?? vid;
  const gate = (vid: string) => store.questionnaire_verdicts.find((v) => v.vendor_id === vid)?.gate_result;
  const unqualified = chosen ? chosen.vendors_used.filter((v) => gate(v) !== "PASS") : [];
  const needsAck = !!chosen && (unqualified.length > 0 || chosen.uncovered_lines.length > 0 || chosen.review_lines.length > 0);
  const pending = entry.vendors.length - store.vendors.length;

  function suggestRationale(sc: Scenario) {
    const parts = [
      `${sc.label} at ${formatInr(sc.total_inr)} (${BASIS_LABEL[sc.basis].toLowerCase()}).`,
      lowest !== null && sc.uncovered_lines.length === 0
        ? sc.total_inr === lowest
          ? "Lowest total among scenarios that cover every line."
          : `${formatInr(sc.total_inr - lowest)} above the lowest full-coverage option, accepted for the reasons below.`
        : "",
      sc.vendors_used.every((v) => gate(v) === "PASS")
        ? "All awarded vendors passed the supplier questionnaire."
        : `Includes vendors that did not fully qualify (${unqualifiedNames(sc).join(", ")}); conditions below.`,
      sc.review_lines.length ? `${linesPhrase(sc.review_lines)} ${sc.review_lines.length === 1 ? "carries a caveat" : "carry caveats"} and will be confirmed with the vendor before PO.` : "",
      sc.uncovered_lines.length ? `${linesPhrase(sc.uncovered_lines)} ${sc.uncovered_lines.length === 1 ? "is" : "are"} not covered and will be sourced separately.` : "",
    ];
    setRationale(parts.filter(Boolean).join(" "));
  }
  function unqualifiedNames(sc: Scenario) {
    return sc.vendors_used.filter((v) => gate(v) !== "PASS").map(name);
  }

  function approve() {
    if (!chosen) return;
    const decision: AwardDecision = {
      scenario_id: chosen.id,
      scenario_label: chosen.label,
      eligibility: ELIGIBILITY_LABEL[chosen.eligibility],
      basis: chosen.basis,
      total_inr: chosen.total_inr,
      allocations: chosen.allocations,
      uncovered_lines: chosen.uncovered_lines,
      rationale: rationale.trim(),
      approved_by: approver.trim() || "Procurement lead",
      approved_at: new Date().toISOString(),
    };
    ws.update(entry!.rfx.rfx_id, (r) => ({ ...r, award: decision, status: "awarded" }));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {pending > 0 && (
        <div className="notice notice-warn">{pending} vendor{pending === 1 ? " hasn't" : "s haven't"} responded yet. Awarding now excludes them.</div>
      )}
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <h2 style={{ fontSize: 16 }}>Award options</h2>
          <div className="page-subtitle">Every option is calculated from the same comparison data. Pick one, record why, and approve.</div>
        </div>
        <div style={{ display: "flex", gap: 6 }} role="radiogroup" aria-label="Price basis">
          {(["headline", "best_available"] as Basis[]).map((b) => (
            <button key={b} role="radio" aria-checked={basis === b} className={`btn btn-sm ${basis === b ? "btn-primary" : ""}`} onClick={() => { setBasis(b); setSelected(null); }}>
              {BASIS_LABEL[b]}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="data-table" style={{ minWidth: 820 }}>
          <thead>
            <tr>
              <th style={{ width: 36 }} />
              <th>Option</th>
              <th style={{ textAlign: "right" }}>Total</th>
              <th style={{ textAlign: "right" }}>vs lowest</th>
              <th>Coverage</th>
              <th>Vendors</th>
              <th>Caveats</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map((s) => {
              const delta = lowest !== null && s.uncovered_lines.length === 0 ? s.total_inr - lowest : null;
              const isSel = s.id === selected;
              return (
                <tr key={s.id} onClick={() => { setSelected(s.id); setAck(false); suggestRationale(s); }} style={{ cursor: "pointer", background: isSel ? "var(--accent-dim)" : undefined }}>
                  <td>
                    <input type="radio" name="scenario" checked={isSel} onChange={() => { setSelected(s.id); setAck(false); suggestRationale(s); }} aria-label={s.label} />
                  </td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{s.label}</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>{ELIGIBILITY_LABEL[s.eligibility]}</div>
                  </td>
                  <td className="mono" style={{ textAlign: "right", fontWeight: 600 }}>{formatInr(s.total_inr)}</td>
                  <td className="mono" style={{ textAlign: "right" }}>
                    {delta === null ? <span className="muted">—</span> : delta === 0 ? <span className="badge badge-ok">Lowest</span> : `+${formatInr(delta)}`}
                  </td>
                  <td>
                    {s.uncovered_lines.length === 0 ? (
                      <span>All {store.line_items.length} lines</span>
                    ) : (
                      <span className="badge badge-warn">{s.uncovered_lines.length} lines not covered</span>
                    )}
                  </td>
                  <td style={{ fontSize: 12.5 }}>
                    {s.vendors_used.map((v) => (
                      <div key={v}>
                        {name(v).split(" ").slice(0, 2).join(" ")}{" "}
                        {gate(v) !== "PASS" && <span className={`badge ${gate(v) === "BORDERLINE" ? "badge-warn" : "badge-fail"}`}>{gate(v) === "BORDERLINE" ? "Borderline" : "Not qualified"}</span>}
                      </div>
                    ))}
                  </td>
                  <td>{s.review_lines.length ? <span className="badge badge-warn">{s.review_lines.length} to confirm</span> : <span className="muted">None</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {chosen && (
        <div className="grid-2" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", alignItems: "start" }}>
          <section className="card card-pad">
            <div className="card-title" style={{ marginBottom: 8 }}>{chosen.label}</div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th style={{ textAlign: "right" }}>Lines</th>
                  <th style={{ textAlign: "right" }}>Value</th>
                </tr>
              </thead>
              <tbody>
                {chosen.vendors_used.map((v) => {
                  const a = chosen.allocations.filter((x) => x.vendor_id === v);
                  return (
                    <tr key={v}>
                      <td>{name(v)}</td>
                      <td style={{ textAlign: "right" }}>{a.length}</td>
                      <td className="mono" style={{ textAlign: "right" }}>{formatInr(a.reduce((s, x) => s + x.line_total_inr, 0))}</td>
                    </tr>
                  );
                })}
                <tr>
                  <td style={{ fontWeight: 600 }}>Total</td>
                  <td style={{ textAlign: "right" }}>{chosen.allocations.length}</td>
                  <td className="mono" style={{ textAlign: "right", fontWeight: 600 }}>{formatInr(chosen.total_inr)}</td>
                </tr>
              </tbody>
            </table>
            {chosen.review_lines.length > 0 && (
              <p className="muted" style={{ fontSize: 12.5, margin: "10px 0 0" }}>
                Confirm before PO: {linesPhrase(chosen.review_lines).toLowerCase()} (conditional, converted or low-confidence prices).{" "}
                <Link href={`/rfx/${encodeURIComponent(id)}/compare`}>Review in the comparison</Link>
              </p>
            )}
            {chosen.uncovered_lines.length > 0 && (
              <p style={{ fontSize: 12.5, margin: "8px 0 0", color: "var(--warn)" }}>Not covered: {linesPhrase(chosen.uncovered_lines).toLowerCase()}.</p>
            )}
          </section>

          <section className="card card-pad">
            <div className="card-title" style={{ marginBottom: 8 }}>Record the decision</div>
            <label style={{ display: "block" }}>
              <span className="field-label">Rationale</span>
              <textarea className="textarea" style={{ minHeight: 120 }} value={rationale} onChange={(e) => setRationale(e.target.value)} />
            </label>
            <label style={{ display: "block", marginTop: 10 }}>
              <span className="field-label">Approved by</span>
              <input className="input" value={approver} onChange={(e) => setApprover(e.target.value)} />
            </label>
            {needsAck && (
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 10, fontSize: 12.5 }}>
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ marginTop: 3 }} />
                <span>
                  I&rsquo;ve reviewed the caveats
                  {unqualified.length ? `, including awarding to ${unqualified.map(name).join(", ")}, which did not fully qualify` : ""}
                  {chosen.uncovered_lines.length ? `, and the ${chosen.uncovered_lines.length} uncovered lines` : ""}.
                </span>
              </label>
            )}
            <button className="btn btn-primary" style={{ marginTop: 12 }} disabled={!rationale.trim() || (needsAck && !ack)} onClick={approve}>
              Approve award
            </button>
          </section>
        </div>
      )}
    </div>
  );
}

function AwardedView({ store, decision, onReopen }: { store: ComparisonStore; decision: AwardDecision; onReopen: () => void }) {
  const name = (vid: string) => store.vendors.find((v) => v.vendor_id === vid)?.full_name ?? vid;
  const vendors = Array.from(new Set(decision.allocations.map((a) => a.vendor_id)));
  function exportAllocation() {
    downloadXlsx(`${store.rfx_id}_award`, [
      {
        name: "Award",
        rows: [
          ["Line", "Item", "Qty", "Vendor", "Unit price (INR)", "Line total (INR)"],
          ...store.line_items.map((li) => {
            const a = decision.allocations.find((x) => x.line_ref === li.no);
            return a ? [li.no, li.item, li.qty, name(a.vendor_id), Math.round(a.unit_price_inr), Math.round(a.line_total_inr)] : [li.no, li.item, li.qty, "Not awarded", null, null];
          }),
          [null, "Total", null, null, null, Math.round(decision.total_inr)],
        ],
      },
    ]);
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <section className="card card-pad">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <span className="badge badge-ok badge-dot">Awarded</span>
            <div className="stat" style={{ marginTop: 8 }}>{formatInr(decision.total_inr)}</div>
            <div className="muted" style={{ fontSize: 13 }}>
              {decision.scenario_label} · {BASIS_LABEL[decision.basis]} · approved by {decision.approved_by} on {formatDate(decision.approved_at)}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
            <button className="btn btn-primary" onClick={() => openAwardMemo(store, decision)}>Award memo</button>
            <button className="btn" onClick={exportAllocation}>Download allocation (Excel)</button>
            <button className="btn btn-ghost" onClick={onReopen}>Reopen</button>
          </div>
        </div>
        <p style={{ margin: "14px 0 0", whiteSpace: "pre-wrap" }}>{decision.rationale}</p>
      </section>
      <section className="card" style={{ overflowX: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Vendor</th>
              <th style={{ textAlign: "right" }}>Lines</th>
              <th style={{ textAlign: "right" }}>Value</th>
            </tr>
          </thead>
          <tbody>
            {vendors.map((v) => {
              const a = decision.allocations.filter((x) => x.vendor_id === v);
              return (
                <tr key={v}>
                  <td>{name(v)}</td>
                  <td style={{ textAlign: "right" }}>{a.length}</td>
                  <td className="mono" style={{ textAlign: "right" }}>{formatInr(a.reduce((s, x) => s + x.line_total_inr, 0))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function linesPhrase(lines: number[]): string {
  return lines.length === 1 ? `Line ${lines[0]}` : `Lines ${lines.join(", ")}`;
}
