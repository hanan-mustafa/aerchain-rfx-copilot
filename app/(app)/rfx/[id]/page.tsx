"use client";

import Link from "next/link";
import { useRfxFromRoute } from "@/lib/useRfx";
import { useComparison } from "@/lib/workspace";
import { formatDate, formatInr, responseCounts } from "@/lib/rfxStatus";

export default function RfxOverviewPage() {
  const { id, entry } = useRfxFromRoute();
  const store = useComparison(entry);
  if (!entry) return null;
  const { rfx } = entry;
  const base = `/rfx/${encodeURIComponent(id)}`;
  const { received, invited } = responseCounts(entry);
  const qualified = store?.questionnaire_verdicts.filter((v) => v.gate_result === "PASS").length ?? 0;
  // Prices someone has to check by hand (conditional prices need a decision, not a review).
  const needsReview =
    store?.normalized_lines.filter((l) => l.flags.some((f) => f === "LOW_CONFIDENCE" || f === "UNIT_MISMATCH" || f === "UNRESOLVED_AMBIGUOUS")).length ?? 0;

  const next =
    entry.status === "awarded"
      ? { text: "Awarded. Download the award memo for your records.", href: `${base}/award`, cta: "View award" }
      : received < invited
      ? { text: `${invited - received} vendor${invited - received === 1 ? " hasn't" : "s haven't"} responded yet. You can upload a response on their behalf.`, href: `${base}/vendors`, cta: "Manage responses" }
      : { text: "All responses are in. Compare them, ask questions, then record your award.", href: `${base}/compare`, cta: "Compare responses" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="grid-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        <Stat label="Responses received" value={`${received} / ${invited}`} />
        <Stat label="Passed qualification" value={store ? `${qualified} / ${store.vendors.length}` : "—"} />
        <Stat label="Prices to check" value={store ? String(needsReview) : "—"} />
        <Stat label={entry.award ? "Awarded value" : "Responses due"} value={entry.award ? formatInr(entry.award.total_inr, { compact: true }) : formatDate(rfx.response_due)} />
      </div>

      <div className="notice" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span>{next.text}</span>
        <Link href={next.href} className="btn btn-primary btn-sm">{next.cta}</Link>
      </div>

      <section className="card card-pad">
        <div className="card-title" style={{ marginBottom: 6 }}>Scope</div>
        <p style={{ margin: 0 }}>{rfx.scope}</p>
      </section>

      <section className="card" style={{ overflowX: "auto" }}>
        <div className="card-pad" style={{ paddingBottom: 8 }}>
          <div className="card-title">Line items</div>
        </div>
        <table className="data-table" style={{ minWidth: 640 }}>
          <thead>
            <tr>
              <th style={{ width: 50 }}>#</th>
              <th>Item</th>
              <th>Specification</th>
              <th>Unit</th>
              <th style={{ textAlign: "right" }}>Qty</th>
            </tr>
          </thead>
          <tbody>
            {rfx.line_items.map((li) => (
              <tr key={li.no}>
                <td className="mono muted">{li.no}</td>
                <td style={{ fontWeight: 500 }}>{li.item}</td>
                <td className="muted">{li.spec}</td>
                <td>{li.uom}</td>
                <td className="mono" style={{ textAlign: "right" }}>{li.qty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid-2">
        <section className="card card-pad">
          <div className="card-title" style={{ marginBottom: 8 }}>Supplier questionnaire</div>
          <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
            {rfx.questionnaire.map((q) => (
              <li key={q.id}>
                {q.question} {q.critical && <span className="badge badge-warn" style={{ marginLeft: 4 }}>Required to qualify</span>}
              </li>
            ))}
          </ol>
        </section>
        <section className="card card-pad">
          <div className="card-title" style={{ marginBottom: 8 }}>Commercial terms</div>
          <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "max-content 1fr", gap: "6px 14px" }}>
            {rfx.terms.map((t) => (
              <div key={t.id} style={{ display: "contents" }}>
                <dt className="muted">{t.label}</dt>
                <dd style={{ margin: 0 }}>{t.requirement}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card card-pad">
      <div className="stat-label">{label}</div>
      <div className="stat" style={{ marginTop: 2 }}>{value}</div>
    </div>
  );
}
