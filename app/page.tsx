"use client";

import { useState, useEffect, useCallback } from "react";
import { ComparisonStore } from "@/lib/schema";
import { ComparisonTable } from "@/components/ComparisonTable";
import { QuestionnaireStrip } from "@/components/QuestionnaireStrip";
import { ChatPanel } from "@/components/ChatPanel";
import { VendorFiles } from "@/components/VendorFiles";
import { VENDORS } from "@/lib/rfxData";

export default function Home() {
  const [store, setStore] = useState<ComparisonStore | null>(null);
  const [loading, setLoading] = useState<false | "cached" | "live">(false);
  const [errors, setErrors] = useState<{ vendor_id: string; error: string }[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const loadExisting = useCallback(async () => {
    const res = await fetch("/api/vendors");
    const data = await res.json();
    if (data.ok) setStore(data.store);
  }, []);

  useEffect(() => {
    loadExisting();
  }, [loadExisting]);

  // Default run reuses stored extractions of unchanged files (no API cost);
  // a live run calls Claude for every file and refreshes that cache.
  async function runExtraction(live: boolean) {
    if (live && !window.confirm("Re-extract all five files live with Claude? This makes real API calls (uses credits) and takes about a minute.")) {
      return;
    }
    setLoading(live ? "live" : "cached");
    setLoadErr(null);
    setErrors([]);
    try {
      const res = await fetch(live ? "/api/extract?fresh=1" : "/api/extract", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setStore(data.store);
        setErrors(data.errors ?? []);
      } else {
        setLoadErr(data.error);
      }
    } catch (err: any) {
      setLoadErr(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: "1400px", margin: "0 auto", padding: "28px 24px" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginBottom: "22px",
          borderBottom: "2px solid var(--ink)",
          paddingBottom: "14px",
        }}
      >
        <div>
          <h1 style={{ fontSize: "26px" }}>FY27 Workplace Hardware Refresh</h1>
          <div style={{ fontSize: "12.5px", color: "var(--ink-dim)", marginTop: "4px" }}>
            RFx PRC-ITHW-FY27-0142 · 5 vendors · 30 line items
            {store && <> · extracted {new Date(store.generated_at).toLocaleString()}</>}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
          <button
            onClick={() => runExtraction(false)}
            disabled={loading !== false}
            style={{
              padding: "10px 18px",
              border: "1px solid var(--ink)",
              borderRadius: "4px",
              background: loading ? "var(--line)" : "var(--ink)",
              color: loading ? "var(--ink-dim)" : "white",
              fontSize: "13.5px",
              fontWeight: 500,
            }}
          >
            {loading === "cached"
              ? "Running pipeline…"
              : loading === "live"
              ? "Extracting live with Claude (~1 min)…"
              : "Run extraction"}
          </button>
          <button
            onClick={() => runExtraction(true)}
            disabled={loading !== false}
            style={{ border: "none", background: "none", padding: 0, fontSize: "12px", color: "var(--accent)", textDecoration: "underline" }}
          >
            Re-extract live with Claude (uses API credits)
          </button>
        </div>
      </header>

      {loadErr && (
        <div style={{ padding: "10px 12px", background: "var(--fail-dim)", color: "var(--fail)", borderRadius: "4px", marginBottom: "16px", fontSize: "13px" }}>
          {loadErr}
        </div>
      )}
      {errors.length > 0 && (
        <div style={{ padding: "10px 12px", background: "var(--warn-dim)", color: "var(--warn)", borderRadius: "4px", marginBottom: "16px", fontSize: "13px" }}>
          {errors.map((e) => (
            <div key={e.vendor_id}>
              {e.vendor_id}: {e.error}
            </div>
          ))}
        </div>
      )}

      <VendorFiles vendors={store?.vendors ?? VENDORS} sources={store?.extraction_sources} />

      {store?.extraction_sources && (
        <div style={{ fontSize: "12.5px", color: "var(--ink-dim)", marginBottom: "14px" }}>
          {(() => {
            const vals = Object.values(store.extraction_sources);
            const cached = vals.filter((v) => v === "cache").length;
            return cached === vals.length
              ? `All ${vals.length} files were already extracted, so their stored results were reused: no API calls. Normalization and the questionnaire gate re-ran in code.`
              : `${vals.length - cached} file(s) extracted live with Claude, ${cached} reused from cache.`;
          })()}
        </div>
      )}

      {!store && !loading && (
        <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--ink-dim)", border: "1px dashed var(--line-strong)", borderRadius: "6px" }}>
          No comparison run yet. Click &ldquo;Run extraction&rdquo; to read all five vendor responses and build the comparison.
        </div>
      )}

      {store && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: "24px", alignItems: "start" }}>
          <div>
            <QuestionnaireStrip vendors={store.vendors} verdicts={store.questionnaire_verdicts} />
            <ComparisonTable store={store} />
          </div>
          <div style={{ position: "sticky", top: "24px", height: "calc(100vh - 140px)" }}>
            <ChatPanel />
          </div>
        </div>
      )}
    </main>
  );
}
