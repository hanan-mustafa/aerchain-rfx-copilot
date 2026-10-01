"use client";

import { useEffect, useState } from "react";
import { VendorMeta } from "@/lib/schema";

const FORMAT_LABEL: Record<VendorMeta["source_format"], string> = {
  xlsx: "Excel",
  docx: "Word",
  pdf: "PDF",
  email: "Email",
  image: "Photo",
};

/**
 * The sample RFx's vendor responses exactly as they arrived, with a short
 * plain-text preview of each file (a direct read, not AI output) and what
 * makes each one hard to compare.
 */
export function VendorFiles({
  vendors,
  sources,
}: {
  vendors: VendorMeta[];
  sources?: Record<string, "live" | "cache">;
}) {
  const [previews, setPreviews] = useState<Record<string, string>>({});

  useEffect(() => {
    for (const v of vendors) {
      if (v.source_format === "image") continue;
      fetch(`/api/files/${v.vendor_id}?preview=1`)
        .then((r) => r.json())
        .then((d) => d.ok && setPreviews((p) => ({ ...p, [v.vendor_id]: d.preview })))
        .catch(() => {});
    }
  }, [vendors]);

  return (
    <section style={{ marginBottom: "22px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "10px", gap: "12px", flexWrap: "wrap" }}>
        <h2 style={{ fontSize: "16px" }}>Response documents</h2>
        <div style={{ fontSize: "12px", color: "var(--ink-dim)" }}>
          Each vendor replied in their own format. The comparison is built from these files.
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
        {vendors.map((v) => {
          const src = sources?.[v.vendor_id];
          return (
            <article
              key={v.vendor_id}
              style={{
                border: "1px solid var(--line)",
                borderRadius: "6px",
                background: "var(--paper-raised)",
                display: "flex",
                flexDirection: "column",
                minWidth: 0,
              }}
            >
              <div style={{ padding: "10px 12px 8px", borderBottom: "1px solid var(--line)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                  <span
                    className="mono"
                    style={{
                      fontSize: "10.5px",
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      padding: "1px 6px",
                      borderRadius: "3px",
                      background: "var(--accent-dim)",
                      color: "var(--accent)",
                    }}
                  >
                    {FORMAT_LABEL[v.source_format]}
                  </span>
                  {src && <span className="badge badge-ok badge-dot" style={{ fontSize: "10.5px" }}>Processed</span>}
                </div>
                <div style={{ fontWeight: 600, fontSize: "13.5px", marginTop: "6px" }}>{v.full_name}</div>
                <div style={{ fontSize: "12px", color: "var(--ink-dim)", marginTop: "2px" }}>{v.edge_case}</div>
              </div>

              <div style={{ position: "relative", height: "150px", overflow: "hidden", background: "var(--paper)" }}>
                {v.source_format === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/files/${v.vendor_id}`}
                    alt={`Photo of ${v.full_name}'s printed rate card`}
                    style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }}
                  />
                ) : (
                  <pre
                    className="mono"
                    style={{ margin: 0, padding: "8px 10px", fontSize: "10.5px", lineHeight: 1.45, whiteSpace: "pre-wrap", wordBreak: "break-word", color: "var(--ink-dim)" }}
                  >
                    {previews[v.vendor_id] ?? "Loading preview…"}
                  </pre>
                )}
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: "40px",
                    background: "linear-gradient(transparent, var(--paper))",
                    pointerEvents: "none",
                  }}
                />
              </div>

              <a
                href={`/api/files/${v.vendor_id}`}
                target="_blank"
                rel="noreferrer"
                style={{ padding: "8px 12px", fontSize: "12.5px", borderTop: "1px solid var(--line)", textDecoration: "none" }}
              >
                {["xlsx", "docx"].includes(v.source_format) ? "Download original" : "Open original"} ↗
                <span style={{ display: "block", color: "var(--ink-dim)", fontSize: "11px", wordBreak: "break-all" }}>{v.source_file}</span>
              </a>
            </article>
          );
        })}
      </div>
    </section>
  );
}
