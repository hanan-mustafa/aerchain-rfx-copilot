"use client";

import { useState } from "react";
import { ComparisonStore, NormalizedLine } from "@/lib/schema";
import { FlagTag } from "./FlagTag";

function formatInr(n: number | null): string {
  if (n === null) return "—";
  return n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export function ComparisonTable({ store }: { store: ComparisonStore }) {
  const [expanded, setExpanded] = useState<string | null>(null); // key: `${vendor_id}:${line_ref}`

  const lineFor = (vendorId: string, lineRef: number): NormalizedLine | undefined =>
    store.normalized_lines.find((l) => l.vendor_id === vendorId && l.line_ref === lineRef);

  return (
    <div style={{ overflowX: "auto", border: "1px solid var(--line)", borderRadius: "4px" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: "900px" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--line-strong)" }}>
            <th style={thStyle("left", "220px")}>Line item</th>
            <th style={thStyle("right", "70px")}>Qty</th>
            {store.vendors.map((v) => (
              <th key={v.vendor_id} style={thStyle("left", "180px")}>
                <div>{v.full_name.split(" ").slice(0, 2).join(" ")}</div>
                <div style={{ fontSize: "10px", color: "var(--ink-dim)", fontWeight: 400 }}>
                  {v.source_format}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {store.line_items.map((li) => (
            <tr key={li.no} style={{ borderBottom: "1px solid var(--line)" }}>
              <td style={{ ...tdStyle, verticalAlign: "top" }}>
                <div style={{ fontWeight: 500 }}>{li.item}</div>
                <div style={{ fontSize: "11px", color: "var(--ink-dim)" }}>{li.spec}</div>
              </td>
              <td className="mono" style={{ ...tdStyle, textAlign: "right", verticalAlign: "top" }}>
                {li.qty}
              </td>
              {store.vendors.map((v) => {
                const line = lineFor(v.vendor_id, li.no);
                const key = `${v.vendor_id}:${li.no}`;
                const isOpen = expanded === key;
                const hasFlags = (line?.flags ?? []).some((f) => f !== "OK");
                return (
                  <td
                    key={v.vendor_id}
                    style={{ ...tdStyle, verticalAlign: "top", cursor: line ? "pointer" : "default" }}
                    onClick={() => line && setExpanded(isOpen ? null : key)}
                  >
                    <div className="mono" style={{ fontWeight: 500 }}>
                      {line?.normalized_unit_price_inr !== null && line?.normalized_unit_price_inr !== undefined
                        ? `₹${formatInr(line.normalized_unit_price_inr)}`
                        : "—"}
                    </div>
                    {line?.alternate_basis && (
                      <div className="mono" style={{ fontSize: "11px", color: "var(--ink-dim)" }}>
                        or ₹{formatInr(line.alternate_basis.unit_price_inr)} ({line.alternate_basis.label})
                      </div>
                    )}
                    <div>{line?.flags.map((f) => <FlagTag key={f} flag={f} />)}</div>
                    {hasFlags && (
                      <div style={{ fontSize: "11px", color: "var(--accent)", marginTop: "2px" }}>
                        {isOpen ? "hide source ▲" : "show source ▼"}
                      </div>
                    )}
                    {isOpen && line && (
                      <div
                        style={{
                          marginTop: "6px",
                          padding: "8px",
                          background: "var(--paper)",
                          border: "1px solid var(--line)",
                          borderRadius: "3px",
                          fontSize: "11px",
                          color: "var(--ink)",
                        }}
                      >
                        <div style={{ color: "var(--ink-dim)", marginBottom: "3px" }}>
                          {line.source_location}
                        </div>
                        <div style={{ marginBottom: line.conversion_notes.length ? "6px" : 0 }}>
                          &ldquo;{line.source_excerpt}&rdquo;
                        </div>
                        {line.conversion_notes.map((note, i) => (
                          <div key={i} style={{ color: "var(--accent)" }}>
                            {note}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function thStyle(align: "left" | "right", width: string): React.CSSProperties {
  return {
    textAlign: align,
    padding: "10px 12px",
    fontSize: "12px",
    fontWeight: 600,
    width,
    background: "var(--paper-raised)",
  };
}

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: "13px",
};
