"use client";

import Link from "next/link";
import { useWorkspace } from "@/lib/workspace";
import { STATUS_BADGE, STATUS_LABEL, confirmDeleteRfx, formatDate, formatInr, responseCounts } from "@/lib/rfxStatus";

export default function RfxListPage() {
  const { rfxs, ready, error, remove } = useWorkspace();

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">RFxs</h1>
          <div className="page-subtitle">Draft requests, track vendor responses and award.</div>
        </div>
        <Link href="/rfx/new" className="btn btn-primary">
          New RFx
        </Link>
      </div>

      {error && <div className="notice notice-fail" style={{ marginBottom: 14 }}>Couldn&rsquo;t load the sample RFx: {error}</div>}
      {!ready && <div className="empty">Loading workspace…</div>}
      {ready && rfxs.length === 0 && (
        <div className="empty">
          <div style={{ fontWeight: 500, color: "var(--ink)", marginBottom: 4 }}>No RFxs yet</div>
          Describe what you need to buy and the co-pilot drafts the line items, questionnaire and terms.
          <div style={{ marginTop: 12 }}>
            <Link href="/rfx/new" className="btn btn-primary">Draft your first RFx</Link>
          </div>
        </div>
      )}

      {ready && rfxs.length > 0 && (
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="data-table" style={{ minWidth: 760 }}>
            <thead>
              <tr>
                <th>RFx</th>
                <th>Status</th>
                <th>Responses</th>
                <th>Line items</th>
                <th>Due</th>
                <th>Award</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rfxs.map((r) => {
                const { received, invited } = responseCounts(r);
                const href = r.status === "draft" ? `/rfx/new?id=${encodeURIComponent(r.rfx.rfx_id)}` : `/rfx/${encodeURIComponent(r.rfx.rfx_id)}`;
                return (
                  <tr key={r.rfx.rfx_id}>
                    <td>
                      <Link href={href} style={{ fontWeight: 600, color: "var(--ink)", textDecoration: "none" }}>
                        {r.rfx.title || "Untitled RFx"}
                      </Link>
                      <div className="muted mono" style={{ fontSize: 11.5 }}>
                        {r.rfx.rfx_id}
                        {r.is_sample && <span className="badge" style={{ marginLeft: 8, fontFamily: "var(--font-body)" }}>Sample</span>}
                      </div>
                    </td>
                    <td>
                      <span className={STATUS_BADGE[r.status]}>{STATUS_LABEL[r.status]}</span>
                    </td>
                    <td>{r.status === "draft" ? <span className="muted">Not sent</span> : `${received} of ${invited}`}</td>
                    <td>{r.rfx.line_items.length}</td>
                    <td>{formatDate(r.rfx.response_due)}</td>
                    <td>{r.award ? formatInr(r.award.total_inr, { compact: true }) : <span className="muted">—</span>}</td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        className="btn btn-ghost btn-sm btn-danger"
                        aria-label={`Delete ${r.rfx.title || "Untitled RFx"}`}
                        onClick={() => confirmDeleteRfx(r) && remove(r.rfx.rfx_id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
