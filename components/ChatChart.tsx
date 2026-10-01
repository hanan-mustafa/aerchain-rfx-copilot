"use client";

import { useState } from "react";
import type { ChartArtifact } from "@/lib/agent/tools";
import { formatInr } from "@/lib/rfxStatus";

// One series, one hue: the lowest bar is emphasized with the full accent and a
// "Lowest" label (never colour alone); the rest use a lighter step of the same
// hue. Both pass 3:1 contrast against the surface (validated).
const BAR = "#5e918a";
const BAR_EMPHASIS = "#1f4b4b";

/** Horizontal bar chart for analyst replies: values labelled, hover/focus tooltip, table view. */
export function ChatChart({ chart }: { chart: ChartArtifact }) {
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const max = Math.max(...chart.bars.map((b) => b.value), 1);

  return (
    <figure className="card" style={{ margin: "8px 0 0", padding: "12px 14px" }}>
      <figcaption style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{chart.title}</div>
          {chart.subtitle && <div className="muted" style={{ fontSize: 11.5 }}>{chart.subtitle}</div>}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setAsTable((t) => !t)} style={{ padding: "2px 6px" }}>
          {asTable ? "Chart" : "Table"}
        </button>
      </figcaption>

      {asTable ? (
        <table className="data-table" style={{ marginTop: 8, fontSize: 12 }}>
          <tbody>
            {chart.bars.map((b) => (
              <tr key={b.label}>
                <td>{b.label}</td>
                <td className="mono" style={{ textAlign: "right" }}>{formatInr(b.value)}</td>
                <td className="muted">{b.highlight ? "Lowest" : b.note ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div role="list" style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 2 }}>
          {chart.bars.map((b, i) => (
            <div
              key={b.label}
              role="listitem"
              tabIndex={0}
              aria-label={`${b.label}: ${formatInr(b.value)}${b.highlight ? ", lowest" : ""}${b.note ? `, ${b.note}` : ""}`}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover((h) => (h === i ? null : h))}
              onFocus={() => setHover(i)}
              onBlur={() => setHover((h) => (h === i ? null : h))}
              style={{
                position: "relative",
                display: "grid",
                gridTemplateColumns: "104px minmax(0, 1fr)",
                alignItems: "center",
                gap: 8,
                padding: "4px 4px",
                borderRadius: 4,
                background: hover === i ? "var(--paper)" : "transparent",
                outline: "none",
              }}
            >
              <div style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.label}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <div
                  style={{
                    height: 16,
                    width: `${Math.max(2, (b.value / max) * 100) * 0.62}%`,
                    background: b.highlight ? BAR_EMPHASIS : BAR,
                    borderRadius: "0 4px 4px 0",
                    flex: "none",
                    opacity: hover === null || hover === i ? 1 : 0.75,
                  }}
                />
                <span className="mono" style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>
                  {formatInr(b.value, { compact: true })}
                </span>
                {b.highlight && <span className="badge badge-ok" style={{ fontSize: 10.5, padding: "0 6px" }}>Lowest</span>}
              </div>
              {b.note && (
                <div style={{ gridColumn: "2", fontSize: 11, color: "var(--warn)", marginTop: -2 }}>{b.note}</div>
              )}
              {hover === i && (
                <div
                  role="tooltip"
                  style={{
                    position: "absolute",
                    right: 6,
                    top: -30,
                    background: "var(--ink)",
                    color: "#fff",
                    fontSize: 11.5,
                    padding: "4px 8px",
                    borderRadius: 4,
                    whiteSpace: "nowrap",
                    zIndex: 2,
                    pointerEvents: "none",
                  }}
                >
                  {b.label}: <span className="mono">{formatInr(b.value)}</span>
                  {b.note ? ` · ${b.note}` : ""}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </figure>
  );
}
