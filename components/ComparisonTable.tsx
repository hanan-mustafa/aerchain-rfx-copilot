"use client";

import { ComparisonStore, NormalizedLine } from "@/lib/schema";
import { FlagTag } from "./FlagTag";

export function formatInr(n: number | null): string {
  if (n === null) return "—";
  return n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export interface CellRef {
  vendor_id: string;
  line_ref: number;
}

/**
 * The comparison grid. Cells stay compact -- price, a short conditional
 * price, flag tags -- and the full provenance (source quote, location,
 * conversion steps) opens in the SourceDrawer when a cell is clicked, so
 * reading a source never reflows the table.
 */
export function ComparisonTable({
  store,
  selected,
  onSelect,
}: {
  store: ComparisonStore;
  selected: CellRef | null;
  onSelect: (cell: CellRef) => void;
}) {
  const lineFor = (vendorId: string, lineRef: number): NormalizedLine | undefined =>
    store.normalized_lines.find((l) => l.vendor_id === vendorId && l.line_ref === lineRef);

  return (
    <div style={{ overflowX: "auto", border: "1px solid var(--line)", borderRadius: "4px" }}>
      <div style={{ padding: "8px 12px", fontSize: "12px", color: "var(--ink-dim)", borderBottom: "1px solid var(--line)" }}>
        Select a price to see the vendor&rsquo;s original wording and how it was converted. All prices in INR per RFx unit.
      </div>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: "900px" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--line-strong)" }}>
            <th style={thStyle("left", "220px")}>Line item</th>
            <th style={thStyle("right", "70px")}>Qty</th>
            {store.vendors.map((v) => (
              <th key={v.vendor_id} style={thStyle("left", "160px")}>
                <div>{v.full_name.split(" ").slice(0, 2).join(" ")}</div>
                <div style={{ fontSize: "10px", color: "var(--ink-dim)", fontWeight: 400 }}>{v.source_format}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {store.line_items.map((li) => (
            <tr key={li.no} style={{ borderBottom: "1px solid var(--line)" }}>
              <td style={{ ...tdStyle, verticalAlign: "top" }}>
                <div style={{ fontWeight: 500 }}>
                  <span className="mono" style={{ color: "var(--ink-dim)", fontSize: "11px", marginRight: "6px" }}>
                    {li.no}
                  </span>
                  {li.item}
                </div>
                <div style={{ fontSize: "11px", color: "var(--ink-dim)" }}>{li.spec}</div>
              </td>
              <td className="mono" style={{ ...tdStyle, textAlign: "right", verticalAlign: "top" }}>
                {li.qty}
              </td>
              {store.vendors.map((v) => {
                const line = lineFor(v.vendor_id, li.no);
                const isSelected = selected?.vendor_id === v.vendor_id && selected?.line_ref === li.no;
                const select = () => line && onSelect({ vendor_id: v.vendor_id, line_ref: li.no });
                return (
                  <td
                    key={v.vendor_id}
                    role={line ? "button" : undefined}
                    tabIndex={line ? 0 : undefined}
                    aria-label={line ? `${v.full_name}, line ${li.no} ${li.item}: show source` : undefined}
                    aria-pressed={line ? isSelected : undefined}
                    onClick={select}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        select();
                      }
                    }}
                    className={line ? "cmp-cell" : undefined}
                    style={{
                      ...tdStyle,
                      verticalAlign: "top",
                      cursor: line ? "pointer" : "default",
                      background: isSelected ? "var(--accent-dim)" : undefined,
                      boxShadow: isSelected ? "inset 0 0 0 2px var(--accent)" : undefined,
                    }}
                  >
                    <div className="mono" style={{ fontWeight: 500 }}>
                      {line?.normalized_unit_price_inr !== null && line?.normalized_unit_price_inr !== undefined
                        ? `₹${formatInr(line.normalized_unit_price_inr)}`
                        : "—"}
                    </div>
                    {line?.alternate_basis && (
                      <div className="mono" style={{ fontSize: "11px", color: "var(--ink-dim)" }}>
                        or ₹{formatInr(line.alternate_basis.unit_price_inr)} net of rebate
                      </div>
                    )}
                    <div>{line?.flags.map((f) => <FlagTag key={f} flag={f} />)}</div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: "2px solid var(--line-strong)", background: "#fbfaf7" }}>
            <td style={{ ...tdStyle, fontWeight: 600 }}>
              Total quoted
              <div style={{ fontSize: "11px", color: "var(--ink-dim)", fontWeight: 400 }}>Priced lines only, headline prices</div>
            </td>
            <td style={tdStyle} />
            {store.vendors.map((v) => {
              const lines = store.normalized_lines.filter((l) => l.vendor_id === v.vendor_id);
              const priced = lines.filter((l) => l.normalized_line_total_inr !== null);
              const total = priced.reduce((sum, l) => sum + (l.normalized_line_total_inr ?? 0), 0);
              const missing = store.line_items.length - priced.length;
              return (
                <td key={v.vendor_id} style={{ ...tdStyle, verticalAlign: "top" }}>
                  <div className="mono" style={{ fontWeight: 600 }}>₹{formatInr(total)}</div>
                  <div style={{ fontSize: "11px", color: missing ? "var(--warn)" : "var(--ink-dim)" }}>
                    {missing ? `${missing} line${missing === 1 ? "" : "s"} not priced` : `All ${store.line_items.length} lines`}
                  </div>
                </td>
              );
            })}
          </tr>
        </tfoot>
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
