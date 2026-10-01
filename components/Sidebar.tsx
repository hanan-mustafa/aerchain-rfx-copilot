"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWorkspace } from "@/lib/workspace";

export function Sidebar() {
  const pathname = usePathname();
  const { rfxs, resetSample } = useWorkspace();
  const recent = rfxs.slice(0, 6);

  return (
    <nav className="sidebar" aria-label="Main">
      <Link href="/" className="brand">
        <span className="brand-mark" aria-hidden>R</span>
        RFx Copilot
      </Link>
      <Link href="/" className={`nav-link ${pathname === "/" ? "active" : ""}`}>
        All RFxs
      </Link>
      <Link href="/rfx/new" className={`nav-link ${pathname === "/rfx/new" ? "active" : ""}`}>
        New RFx
      </Link>
      {recent.length > 0 && <div className="nav-section">Recent</div>}
      {recent.map((r) => {
        const href = r.status === "draft" ? `/rfx/new?id=${encodeURIComponent(r.rfx.rfx_id)}` : `/rfx/${encodeURIComponent(r.rfx.rfx_id)}`;
        const active = pathname.startsWith(`/rfx/${encodeURIComponent(r.rfx.rfx_id)}`) || pathname.startsWith(`/rfx/${r.rfx.rfx_id}`);
        return (
          <Link
            key={r.rfx.rfx_id}
            href={href}
            className={`nav-link ${active ? "active" : ""}`}
            style={{ fontSize: "13px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}
            title={r.rfx.title}
          >
            {r.rfx.title || "Untitled RFx"}
          </Link>
        );
      })}
      <div className="sidebar-footer">
        <div style={{ fontWeight: 500, color: "var(--ink)" }}>BuyerCo Procurement</div>
        <div>Demo workspace</div>
        <button
          className="btn-ghost"
          style={{ border: "none", background: "none", padding: 0, marginTop: "8px", fontSize: "12px", color: "var(--accent)" }}
          onClick={() => {
            if (window.confirm("Restore the sample RFx to its original state? Your own RFxs are not affected.")) resetSample();
          }}
        >
          Reset sample RFx
        </button>
      </div>
    </nav>
  );
}
