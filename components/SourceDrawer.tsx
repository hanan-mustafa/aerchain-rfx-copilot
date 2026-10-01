"use client";

import { useEffect, useRef } from "react";
import { ComparisonStore } from "@/lib/schema";
import { FlagTag, FLAG_EXPLANATION } from "./FlagTag";
import { CellRef, formatInr } from "./ComparisonTable";

/**
 * Full provenance for one vendor's price on one RFx line: what the vendor
 * actually wrote, where, every conversion applied in code, and what each
 * flag means. Slides in over the right-hand column so the comparison table
 * never reflows; reads only the comparison store, like everything else.
 */
export function SourceDrawer({
  store,
  cell,
  onSelect,
  onClose,
}: {
  store: ComparisonStore;
  cell: CellRef;
  onSelect: (cell: CellRef) => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const vendor = store.vendors.find((v) => v.vendor_id === cell.vendor_id);
  const spec = store.line_items.find((li) => li.no === cell.line_ref);
  const line = store.normalized_lines.find((l) => l.vendor_id === cell.vendor_id && l.line_ref === cell.line_ref);
  if (!vendor || !spec || !line) return null;

  const reviewFlags = line.flags.filter((f) => f !== "OK");
  const others = store.vendors.map((v) => ({
    vendor: v,
    line: store.normalized_lines.find((l) => l.vendor_id === v.vendor_id && l.line_ref === cell.line_ref),
  }));
  const prices = others
    .map((o) => o.line?.normalized_unit_price_inr)
    .filter((p): p is number => p !== null && p !== undefined);
  const lowest = prices.length ? Math.min(...prices) : null;
  const backfilled = line.flags.includes("NOT_QUOTED") && line.source_location === "n/a";

  return (
    <aside className="source-drawer" role="dialog" aria-label={`Source for ${vendor.full_name}, line ${spec.no}`}>
      <header style={{ padding: "16px 18px 12px", borderBottom: "1px solid var(--line)", display: "flex", gap: "12px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "11px", color: "var(--ink-dim)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Line {spec.no} · qty {spec.qty} · {spec.uom}
          </div>
          <h3 style={{ fontSize: "18px", marginTop: "2px" }}>{spec.item}</h3>
          <div style={{ fontSize: "12px", color: "var(--ink-dim)" }}>{spec.spec}</div>
        </div>
        <button
          ref={closeRef}
          onClick={onClose}
          aria-label="Close source panel"
          style={{ alignSelf: "flex-start", border: "1px solid var(--line)", background: "var(--paper)", borderRadius: "4px", width: "30px", height: "30px", fontSize: "16px", lineHeight: 1 }}
        >
          ×
        </button>
      </header>

      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: "18px" }}>
        <section>
          <div style={{ fontSize: "12.5px", fontWeight: 600 }}>
            {vendor.full_name} <span style={{ fontWeight: 400, color: "var(--ink-dim)" }}>· {vendor.source_format}</span>
          </div>
          <div className="mono" style={{ fontSize: "26px", fontWeight: 500, marginTop: "4px" }}>
            {line.normalized_unit_price_inr !== null ? `₹${formatInr(line.normalized_unit_price_inr)}` : "No comparable price"}
            {line.normalized_unit_price_inr !== null && (
              <span style={{ fontSize: "12px", color: "var(--ink-dim)", fontFamily: "var(--font-body)", marginLeft: "6px" }}>
                {spec.uom}
              </span>
            )}
          </div>
          {line.normalized_line_total_inr !== null && (
            <div style={{ fontSize: "12px", color: "var(--ink-dim)" }}>
              Line total <span className="mono">₹{formatInr(line.normalized_line_total_inr)}</span> for {spec.qty}
            </div>
          )}
          {line.alternate_basis && (
            <div style={{ marginTop: "8px", padding: "8px 10px", background: "var(--warn-dim)", borderRadius: "4px", fontSize: "12.5px" }}>
              <span className="mono" style={{ fontWeight: 600 }}>₹{formatInr(line.alternate_basis.unit_price_inr)}</span>{" "}
              {line.alternate_basis.label}. Both prices are kept; you choose which to compare on.
            </div>
          )}
        </section>

        {reviewFlags.length > 0 && (
          <section>
            <h4 className="drawer-h">Flags</h4>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
              {reviewFlags.map((f) => (
                <li key={f} style={{ fontSize: "12.5px" }}>
                  <FlagTag flag={f} />
                  <div style={{ color: "var(--ink-dim)", marginTop: "2px" }}>{FLAG_EXPLANATION[f]}</div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h4 className="drawer-h">What the vendor wrote</h4>
          {backfilled ? (
            <div style={{ fontSize: "12.5px", color: "var(--ink-dim)" }}>
              Nothing: this line does not appear anywhere in {vendor.full_name}&rsquo;s response.
            </div>
          ) : (
            <>
              <blockquote
                style={{
                  margin: 0,
                  padding: "8px 12px",
                  borderLeft: "3px solid var(--accent)",
                  background: "var(--paper)",
                  fontSize: "12.5px",
                  whiteSpace: "pre-wrap",
                  overflowWrap: "anywhere",
                }}
              >
                {line.source_excerpt}
              </blockquote>
              <div style={{ fontSize: "11.5px", color: "var(--ink-dim)", marginTop: "6px" }}>
                Location: <span className="mono">{line.source_location}</span>
              </div>
              {line.original_unit_price !== null && (
                <div style={{ fontSize: "11.5px", color: "var(--ink-dim)" }}>
                  As quoted:{" "}
                  <span className="mono">
                    {line.original_currency} {line.original_unit_price.toLocaleString("en-IN")} {line.original_unit_of_measure}
                  </span>
                </div>
              )}
            </>
          )}
          <a
            href={`/api/files/${vendor.vendor_id}`}
            target="_blank"
            rel="noreferrer"
            style={{ display: "inline-block", marginTop: "8px", fontSize: "12.5px" }}
          >
            Open {vendor.source_file} ↗
          </a>
        </section>

        {line.conversion_notes.length > 0 && (
          <section>
            <h4 className="drawer-h">How this number was produced</h4>
            <ol style={{ margin: 0, paddingLeft: "18px", fontSize: "12.5px", display: "flex", flexDirection: "column", gap: "4px" }}>
              {line.conversion_notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ol>
            <div style={{ fontSize: "11px", color: "var(--ink-dim)", marginTop: "6px" }}>
              Computed in deterministic code (lib/normalize.ts), not by the model.
            </div>
          </section>
        )}

        <section>
          <h4 className="drawer-h">All vendors on line {spec.no}</h4>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
            <tbody>
              {others.map(({ vendor: v, line: l }) => {
                const isThis = v.vendor_id === cell.vendor_id;
                const price = l?.normalized_unit_price_inr ?? null;
                return (
                  <tr
                    key={v.vendor_id}
                    onClick={() => l && onSelect({ vendor_id: v.vendor_id, line_ref: cell.line_ref })}
                    style={{
                      cursor: l ? "pointer" : "default",
                      background: isThis ? "var(--accent-dim)" : undefined,
                      borderBottom: "1px solid var(--line)",
                    }}
                  >
                    <td style={{ padding: "5px 6px" }}>{v.full_name.split(" ").slice(0, 2).join(" ")}</td>
                    <td className="mono" style={{ padding: "5px 6px", textAlign: "right", whiteSpace: "nowrap" }}>
                      {price !== null ? `₹${formatInr(price)}` : "—"}
                      {price !== null && price === lowest && (
                        <span style={{ fontFamily: "var(--font-body)", fontSize: "10.5px", color: "var(--ok)", marginLeft: "6px" }}>
                          lowest
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ fontSize: "11px", color: "var(--ink-dim)", marginTop: "6px" }}>
            Headline prices; click a vendor to see its source.
          </div>
        </section>
      </div>
    </aside>
  );
}
