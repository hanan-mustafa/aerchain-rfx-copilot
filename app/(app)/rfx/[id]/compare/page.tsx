"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRfxFromRoute } from "@/lib/useRfx";
import { useComparison } from "@/lib/workspace";
import { openOriginal } from "@/lib/openOriginal";
import { ComparisonTable, CellRef } from "@/components/ComparisonTable";
import { SourceDrawer } from "@/components/SourceDrawer";
import { QuestionnaireStrip } from "@/components/QuestionnaireStrip";
import { VendorTermsTable } from "@/components/VendorTermsTable";
import { ChatPanel } from "@/components/ChatPanel";

export default function ComparePage() {
  const { id, entry } = useRfxFromRoute();
  const store = useComparison(entry);
  const [view, setView] = useState<"prices" | "terms">("prices");
  const [selectedCell, setSelectedCell] = useState<CellRef | null>(null);
  const closeDrawer = useCallback(() => setSelectedCell(null), []);
  if (!entry) return null;

  if (!store) {
    return (
      <div className="empty">
        <div style={{ fontWeight: 500, color: "var(--ink)", marginBottom: 4 }}>No responses yet</div>
        The comparison fills in as vendor responses arrive.
        <div style={{ marginTop: 12 }}>
          <Link href={`/rfx/${encodeURIComponent(id)}/vendors`} className="btn btn-primary">Go to vendors &amp; responses</Link>
        </div>
      </div>
    );
  }

  const pending = entry.vendors.length - store.vendors.length;
  const open = (vendorId: string) => openOriginal(entry, vendorId);

  return (
    <>
      {pending > 0 && (
        <div className="notice notice-warn" style={{ marginBottom: 14 }}>
          Showing {store.vendors.length} of {entry.vendors.length} vendors. {pending} haven&rsquo;t responded yet.
        </div>
      )}
      <div className="workbench">
        <div style={{ minWidth: 0 }}>
          <QuestionnaireStrip vendors={store.vendors} verdicts={store.questionnaire_verdicts} />
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }} role="tablist" aria-label="Comparison view">
            {(
              [
                ["prices", "Prices"],
                ["terms", "Terms & qualification"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={view === key}
                className={`btn btn-sm ${view === key ? "btn-primary" : ""}`}
                onClick={() => setView(key)}
              >
                {label}
              </button>
            ))}
          </div>
          {view === "prices" ? (
            <ComparisonTable store={store} selected={selectedCell} onSelect={setSelectedCell} />
          ) : (
            <VendorTermsTable store={store} onOpenFile={open} />
          )}
        </div>
        <div className="workbench-chat">
          <ChatPanel store={store} />
        </div>
      </div>
      {selectedCell && (
        <SourceDrawer store={store} cell={selectedCell} onSelect={setSelectedCell} onClose={closeDrawer} onOpenFile={open} />
      )}
    </>
  );
}
