"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRfxFromRoute } from "@/lib/useRfx";
import { STATUS_BADGE, STATUS_LABEL, formatDate, responseCounts } from "@/lib/rfxStatus";
import { downloadRfxPack } from "@/lib/downloads";

export default function RfxLayout({ children }: { children: React.ReactNode }) {
  const { id, entry, ws } = useRfxFromRoute();
  const pathname = usePathname();

  if (!ws.ready) return <div className="empty">Loading…</div>;
  if (!entry) {
    return (
      <div className="empty">
        <div style={{ fontWeight: 500, color: "var(--ink)" }}>RFx not found</div>
        It may have been created in another browser.{" "}
        <Link href="/">Back to all RFxs</Link>
      </div>
    );
  }

  const base = `/rfx/${encodeURIComponent(id)}`;
  const { received, invited } = responseCounts(entry);
  const tabs = [
    { href: base, label: "Overview" },
    { href: `${base}/vendors`, label: "Vendors & responses", count: `${received}/${invited}` },
    { href: `${base}/compare`, label: "Compare & analyze" },
    { href: `${base}/award`, label: "Award" },
  ];

  return (
    <>
      <div className="breadcrumbs">
        <Link href="/">RFxs</Link> / <span className="mono">{entry.rfx.rfx_id}</span>
      </div>
      <div className="page-header" style={{ marginBottom: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h1 className="page-title">{entry.rfx.title}</h1>
            <span className={STATUS_BADGE[entry.status]}>{STATUS_LABEL[entry.status]}</span>
          </div>
          <div className="page-subtitle">
            {entry.rfx.buyer_org} · {entry.rfx.line_items.length} line items · {received} of {invited} responses · due{" "}
            {formatDate(entry.rfx.response_due)}
          </div>
        </div>
        <button className="btn" onClick={() => downloadRfxPack(entry.rfx)}>
          Download RFx template
        </button>
      </div>
      <nav className="tabs" aria-label="RFx sections">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} className={`tab ${pathname === t.href ? "active" : ""}`}>
            {t.label}
            {t.count && <span className="tab-count">{t.count}</span>}
          </Link>
        ))}
      </nav>
      {children}
    </>
  );
}
