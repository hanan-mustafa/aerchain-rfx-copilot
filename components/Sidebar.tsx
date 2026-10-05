"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWorkspace } from "@/lib/workspace";

const Icon = ({ d }: { d: string }) => (
  <svg className="nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);
const ICON_LIST = "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01";
const ICON_PLUS = "M12 5v14M5 12h14";
const ICON_DOC = "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5zM14 3v5h5";

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const { rfxs, resetSample } = useWorkspace();
  const recent = rfxs.slice(0, 6);
  const hasSample = rfxs.some((r) => r.is_sample);

  return (
    <nav className={`sidebar ${collapsed ? "sidebar-collapsed" : ""}`} aria-label="Main">
      <Link href="/" className="brand" title="RFx Copilot">
        <span className="brand-mark" aria-hidden>R</span>
        <span className="nav-label">RFx Copilot</span>
      </Link>
      <Link href="/" className={`nav-link ${pathname === "/" ? "active" : ""}`} title={collapsed ? "All RFxs" : undefined} aria-label="All RFxs">
        <Icon d={ICON_LIST} />
        <span className="nav-label">All RFxs</span>
      </Link>
      <Link href="/rfx/new" className={`nav-link ${pathname === "/rfx/new" ? "active" : ""}`} title={collapsed ? "New RFx" : undefined} aria-label="New RFx">
        <Icon d={ICON_PLUS} />
        <span className="nav-label">New RFx</span>
      </Link>

      <div className="nav-expanded-only" style={{ display: "contents" }}>
        {recent.length > 0 && <div className="nav-section">Recent</div>}
        {recent.map((r) => {
          const href = r.status === "draft" ? `/rfx/new?id=${encodeURIComponent(r.rfx.rfx_id)}` : `/rfx/${encodeURIComponent(r.rfx.rfx_id)}`;
          const active = pathname.startsWith(`/rfx/${encodeURIComponent(r.rfx.rfx_id)}`) || pathname.startsWith(`/rfx/${r.rfx.rfx_id}`);
          return (
            <Link key={r.rfx.rfx_id} href={href} className={`nav-link nav-recent ${active ? "active" : ""}`} title={r.rfx.title}>
              <Icon d={ICON_DOC} />
              <span className="nav-label">{r.rfx.title || "Untitled RFx"}</span>
            </Link>
          );
        })}
      </div>

      <div className="sidebar-footer">
        <div className="nav-expanded-only">
          <div style={{ fontWeight: 500, color: "var(--ink)" }}>BuyerCo Procurement</div>
          <div>Demo workspace</div>
          <button
            style={{ border: "none", background: "none", padding: 0, marginTop: "8px", fontSize: "12px", color: "var(--accent)" }}
            onClick={() => {
              if (window.confirm(hasSample ? "Restore the sample RFx to its original state? Your own RFxs are not affected." : "Restore the sample RFx? Your own RFxs are not affected.")) resetSample();
            }}
          >
            {hasSample ? "Reset sample RFx" : "Restore sample RFx"}
          </button>
        </div>
        <button
          className="nav-toggle"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d={collapsed ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"} />
          </svg>
          <span className="nav-label">Collapse</span>
        </button>
      </div>
    </nav>
  );
}
