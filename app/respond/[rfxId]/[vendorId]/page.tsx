"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useWorkspace } from "@/lib/workspace";
import { ACCEPTED_FILES, ACCEPTED_LABEL, PROCESSING_MESSAGES, processUpload } from "@/lib/intake";
import { downloadRfxPack } from "@/lib/downloads";
import { formatDate } from "@/lib/rfxStatus";

/**
 * What a vendor sees when they open the reply link from the RFx email.
 * Nobody is forced into the template: any file format is accepted. (In this
 * demo the submission is saved to the workspace in this browser, standing in
 * for a real inbound channel.)
 */
export default function VendorResponsePage() {
  const params = useParams<{ rfxId: string; vendorId: string }>();
  const rfxId = decodeURIComponent(params.rfxId);
  const vendorId = decodeURIComponent(params.vendorId);
  const ws = useWorkspace();
  const entry = ws.get(rfxId);
  const vendor = entry?.vendors.find((v) => v.vendor_id === vendorId);
  const existing = entry?.responses[vendorId];

  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function submit() {
    if (!entry || !file) return;
    setBusy(true);
    setError(null);
    try {
      const record = await processUpload({ rfx: entry.rfx, vendorId, file, via: "vendor_portal", note: note.trim() || undefined });
      ws.update(rfxId, (r) => ({ ...r, responses: { ...r.responses, [vendorId]: record } }));
      setDone(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <header style={{ borderBottom: "1px solid var(--line)", background: "var(--paper-raised)" }}>
        <div style={{ maxWidth: 820, margin: "0 auto", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div className="brand" style={{ padding: 0 }}>
            <span className="brand-mark" aria-hidden>R</span>
            {entry?.rfx.buyer_org ?? "RFx Copilot"}
          </div>
          <span className="badge">Supplier response</span>
        </div>
      </header>

      <main style={{ maxWidth: 820, margin: "0 auto", padding: "24px 20px 60px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="notice" style={{ fontSize: 12 }}>
          Preview of the vendor&rsquo;s view. In this demo, submissions are saved to the workspace in this browser.
        </div>

        {!ws.ready && <div className="empty">Loading…</div>}
        {ws.ready && (!entry || !vendor) && (
          <div className="empty">
            <div style={{ fontWeight: 500, color: "var(--ink)" }}>This link isn&rsquo;t valid</div>
            The RFx may have closed, or the link was opened in a different browser from the one it was created in.
          </div>
        )}

        {entry && vendor && (
          <>
            <section className="card card-pad">
              <div className="muted mono" style={{ fontSize: 12 }}>{entry.rfx.rfx_id}</div>
              <h1 style={{ fontSize: 22, marginTop: 2 }}>{entry.rfx.title}</h1>
              <div className="page-subtitle">
                Request for quotation from {entry.rfx.buyer_org} to {vendor.full_name}
                {entry.rfx.response_due ? ` · due ${formatDate(entry.rfx.response_due)}` : ""}
              </div>
              <p style={{ margin: "12px 0 0" }}>{entry.rfx.scope}</p>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 12, fontSize: 13 }}>
                <span>
                  <strong>{entry.rfx.line_items.length}</strong> line items
                </span>
                <span>
                  <strong>{entry.rfx.questionnaire.length}</strong> questionnaire questions
                </span>
              </div>
              <button className="btn" style={{ marginTop: 14 }} onClick={() => downloadRfxPack(entry.rfx)}>
                Download RFx (Excel)
              </button>
            </section>

            {entry.status === "awarded" ? (
              <div className="empty">This RFx has been awarded and is no longer accepting responses.</div>
            ) : done ? (
              <section className="card card-pad" style={{ textAlign: "center" }}>
                <div style={{ fontSize: 28 }} aria-hidden>✓</div>
                <div className="card-title">Response received</div>
                <p className="muted" style={{ margin: "6px 0 0" }}>
                  Thanks. {entry.rfx.buyer_org} has your response and will be in touch. You can submit an updated version any time before the due date.
                </p>
                <button className="btn" style={{ marginTop: 12 }} onClick={() => { setDone(false); setFile(null); setNote(""); }}>
                  Submit an update
                </button>
              </section>
            ) : (
              <section className="card card-pad">
                <div className="card-title">Submit your response</div>
                <p className="muted" style={{ margin: "4px 0 12px", fontSize: 13 }}>
                  Send your quote in whatever format you already use. You don&rsquo;t need to use our template.
                  {existing ? " You've already responded; a new file replaces your earlier submission." : ""}
                </p>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    const f = e.dataTransfer.files?.[0];
                    if (f) setFile(f);
                  }}
                  onClick={() => inputRef.current?.click()}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  style={{
                    border: `2px dashed ${dragOver ? "var(--accent)" : "var(--line-strong)"}`,
                    background: dragOver ? "var(--accent-dim)" : "var(--paper)",
                    borderRadius: 8,
                    padding: "28px 16px",
                    textAlign: "center",
                    cursor: "pointer",
                  }}
                >
                  <input
                    ref={inputRef}
                    type="file"
                    accept={ACCEPTED_FILES}
                    style={{ display: "none" }}
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                  {file ? (
                    <>
                      <div style={{ fontWeight: 600 }}>{file.name}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{(file.size / 1024).toFixed(0)} KB · click to choose a different file</div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontWeight: 500 }}>Drop your quote here, or click to browse</div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{ACCEPTED_LABEL}</div>
                    </>
                  )}
                </div>
                <label style={{ display: "block", marginTop: 14 }}>
                  <span className="field-label">Note to the buyer (optional)</span>
                  <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything we should know about your quote" />
                </label>
                {error && <div className="notice notice-fail" style={{ marginTop: 12 }}>{error}</div>}
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
                  <button className="btn btn-primary" disabled={!file || busy} onClick={submit}>
                    {busy ? "Submitting…" : "Submit response"}
                  </button>
                  {busy && <SubmitProgress />}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function SubmitProgress() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => Math.min(s + 1, PROCESSING_MESSAGES.length - 1)), 2500);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="chat-progress" role="status" aria-live="polite">
      <span className="chat-progress-dot" />
      <span key={step} className="chat-progress-text">{PROCESSING_MESSAGES[step]}</span>
    </span>
  );
}
