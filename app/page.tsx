"use client";

import { useState, useEffect, useCallback } from "react";
import { ComparisonStore } from "@/lib/schema";
import { ComparisonTable } from "@/components/ComparisonTable";
import { QuestionnaireStrip } from "@/components/QuestionnaireStrip";
import { ChatPanel } from "@/components/ChatPanel";

export default function Home() {
  const [store, setStore] = useState<ComparisonStore | null>(null);
  const [loading, setLoading] = useState(false);
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

  async function runExtraction() {
    setLoading(true);
    setLoadErr(null);
    setErrors([]);
    try {
      const res = await fetch("/api/extract", { method: "POST" });
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
        <button
          onClick={runExtraction}
          disabled={loading}
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
          {loading ? "Extracting all 5 vendor responses…" : store ? "Re-run extraction" : "Run extraction"}
        </button>
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
