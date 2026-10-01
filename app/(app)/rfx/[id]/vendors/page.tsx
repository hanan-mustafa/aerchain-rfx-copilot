"use client";

import { useEffect, useRef, useState } from "react";
import { useRfxFromRoute } from "@/lib/useRfx";
import { buildInvitation, replyUrl, ResponseRecord, WorkspaceRfx } from "@/lib/workspace";
import { ACCEPTED_FILES, ACCEPTED_LABEL, PROCESSING_MESSAGES, processUpload, friendlyProcessingError } from "@/lib/intake";
import { openOriginal } from "@/lib/openOriginal";
import { formatDate } from "@/lib/rfxStatus";
import { VendorFiles } from "@/components/VendorFiles";
import { VendorMeta } from "@/lib/schema";

const VIA_LABEL: Record<ResponseRecord["received_via"], string> = {
  sample: "Received by email",
  upload: "Uploaded by your team",
  vendor_portal: "Submitted by vendor",
};

export default function VendorsPage() {
  const { entry, ws } = useRfxFromRoute();
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [openInvite, setOpenInvite] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  if (!entry) return null;
  const rfxId = entry.rfx.rfx_id;

  async function upload(vendorId: string, file: File) {
    setBusy((b) => ({ ...b, [vendorId]: true }));
    setErrors((e) => ({ ...e, [vendorId]: "" }));
    try {
      const record = await processUpload({ rfx: entry!.rfx, vendorId, file, via: "upload" });
      ws.update(rfxId, (r) => ({ ...r, responses: { ...r.responses, [vendorId]: record } }));
    } catch (e: any) {
      setErrors((x) => ({ ...x, [vendorId]: e.message }));
    } finally {
      setBusy((b) => ({ ...b, [vendorId]: false }));
    }
  }

  async function reprocessSample(vendorId: string) {
    if (!window.confirm("Re-read this response with AI? This makes a new AI call and takes up to a minute.")) return;
    setBusy((b) => ({ ...b, [vendorId]: true }));
    setErrors((e) => ({ ...e, [vendorId]: "" }));
    try {
      const res = await fetch("/api/responses/sample", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendor_id: vendorId, fresh: true }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(friendlyProcessingError(data.error));
      ws.update(rfxId, (r) => ({ ...r, responses: { ...r.responses, [vendorId]: { ...data.response, received_via: "sample" } } }));
    } catch (e: any) {
      setErrors((x) => ({ ...x, [vendorId]: e.message }));
    } finally {
      setBusy((b) => ({ ...b, [vendorId]: false }));
    }
  }

  function copyLink(vendorId: string) {
    navigator.clipboard?.writeText(replyUrl(rfxId, vendorId)).then(() => {
      setCopied(vendorId);
      setTimeout(() => setCopied(null), 1800);
    });
  }

  const received = Object.keys(entry.responses).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <h2 style={{ fontSize: 16 }}>Vendors</h2>
          <div className="page-subtitle">
            {received} of {entry.vendors.length} responded. Vendors reply in any format; responses are read automatically and added to the comparison.
          </div>
        </div>
        {entry.status !== "awarded" && (
          <button className="btn" onClick={() => setAdding(true)}>
            Add vendor
          </button>
        )}
      </div>

      {adding && <AddVendorForm entry={entry} onDone={() => setAdding(false)} />}

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="data-table" style={{ minWidth: 820 }}>
          <thead>
            <tr>
              <th>Vendor</th>
              <th>Invitation</th>
              <th>Response</th>
              <th style={{ textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {entry.vendors.map((v) => {
              const resp = entry.responses[v.vendor_id];
              const invite = entry.invitations.find((i) => i.vendor_id === v.vendor_id);
              return (
                <tr key={v.vendor_id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{v.full_name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {v.contact.split(",")[0]}
                      {v.email ? ` · ${v.email}` : ""}
                    </div>
                  </td>
                  <td>
                    {invite ? (
                      <>
                        <div>Sent {formatDate(invite.sent_at)}</div>
                        <button className="btn-ghost" style={{ border: "none", background: "none", padding: 0, fontSize: 12, color: "var(--accent)" }} onClick={() => setOpenInvite(openInvite === v.vendor_id ? null : v.vendor_id)}>
                          {openInvite === v.vendor_id ? "Hide email" : "View email"}
                        </button>
                      </>
                    ) : (
                      <span className="muted">Not sent</span>
                    )}
                  </td>
                  <td style={{ minWidth: 220 }}>
                    {busy[v.vendor_id] ? (
                      <Processing />
                    ) : resp ? (
                      <>
                        <span className="badge badge-ok badge-dot">Received</span>
                        <div style={{ fontSize: 12, marginTop: 4 }}>
                          <button
                            onClick={() => openOriginal(entry, v.vendor_id)}
                            style={{ border: "none", background: "none", padding: 0, color: "var(--accent)", fontSize: 12, textAlign: "left", wordBreak: "break-all" }}
                          >
                            {resp.file_name} ↗
                          </button>
                        </div>
                        <div className="muted" style={{ fontSize: 11.5 }}>
                          {VIA_LABEL[resp.received_via]} · {formatDate(resp.processed_at)}
                        </div>
                        {resp.note && <div style={{ fontSize: 12, marginTop: 4, fontStyle: "italic" }}>&ldquo;{resp.note}&rdquo;</div>}
                      </>
                    ) : (
                      <span className="badge">Awaiting response</span>
                    )}
                    {errors[v.vendor_id] && <div className="notice notice-fail" style={{ marginTop: 6, fontSize: 12 }}>{errors[v.vendor_id]}</div>}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {entry.status !== "awarded" && (
                        <UploadButton disabled={busy[v.vendor_id]} label={resp ? "Replace" : "Upload response"} onFile={(f) => upload(v.vendor_id, f)} />
                      )}
                      {resp?.received_via === "sample" && entry.status !== "awarded" && (
                        <button className="btn btn-sm" disabled={busy[v.vendor_id]} onClick={() => reprocessSample(v.vendor_id)} title="Read this response again with AI">
                          Re-read
                        </button>
                      )}
                      <button className="btn btn-sm" onClick={() => copyLink(v.vendor_id)} title="Link the vendor uses to submit their response">
                        {copied === v.vendor_id ? "Copied" : "Copy reply link"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {openInvite &&
        (() => {
          const inv = entry.invitations.find((i) => i.vendor_id === openInvite);
          if (!inv) return null;
          return (
            <section className="card card-pad">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <div className="card-title">{inv.subject}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    To {inv.to || "—"} · sent {formatDate(inv.sent_at)} · attachment: {rfxId}_RFx.xlsx
                  </div>
                </div>
                <button className="btn btn-sm" onClick={() => setOpenInvite(null)}>Close</button>
              </div>
              <pre style={{ whiteSpace: "pre-wrap", fontFamily: "var(--font-body)", fontSize: 13, margin: "12px 0 0", background: "var(--paper)", padding: 12, borderRadius: 6 }}>{inv.body}</pre>
            </section>
          );
        })()}

      {entry.is_sample && (
        <VendorFiles vendors={entry.vendors} />
      )}
    </div>
  );
}

function Processing() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => Math.min(s + 1, PROCESSING_MESSAGES.length - 1)), 2500);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="chat-progress" role="status" aria-live="polite">
      <span className="chat-progress-dot" />
      <span key={step} className="chat-progress-text">{PROCESSING_MESSAGES[step]}</span>
    </div>
  );
}

function UploadButton({ label, onFile, disabled }: { label: string; onFile: (f: File) => void; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={ACCEPTED_FILES}
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      <button className="btn btn-sm btn-primary" disabled={disabled} onClick={() => ref.current?.click()} title={ACCEPTED_LABEL}>
        {label}
      </button>
    </>
  );
}

function AddVendorForm({ entry, onDone }: { entry: WorkspaceRfx; onDone: () => void }) {
  const { update } = useRfxFromRoute().ws;
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [sendNow, setSendNow] = useState(true);

  function save() {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "vendor";
    let id = base;
    for (let i = 2; entry.vendors.some((v) => v.vendor_id === id); i++) id = `${base}_${i}`;
    const vendor: VendorMeta = { vendor_id: id, full_name: name.trim(), contact: contact.trim() || name.trim(), email: email.trim(), source_format: "email", source_file: "" };
    update(entry.rfx.rfx_id, (r) => ({
      ...r,
      vendors: [...r.vendors, vendor],
      invitations: sendNow ? [...r.invitations, buildInvitation(r.rfx, vendor, new Date().toISOString())] : r.invitations,
    }));
    onDone();
  }

  return (
    <section className="card card-pad">
      <div className="card-title" style={{ marginBottom: 10 }}>Add vendor</div>
      <div className="grid-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <label>
          <span className="field-label">Company</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Supplies Pvt. Ltd." />
        </label>
        <label>
          <span className="field-label">Contact name</span>
          <input className="input" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Asha Rao" />
        </label>
        <label>
          <span className="field-label">Email</span>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="asha@acme.example" />
        </label>
      </div>
      <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, fontSize: 13 }}>
        <input type="checkbox" checked={sendNow} onChange={(e) => setSendNow(e.target.checked)} /> Send the RFx invitation now
      </label>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button className="btn btn-primary" disabled={!name.trim()} onClick={save}>Add vendor</button>
        <button className="btn" onClick={onDone}>Cancel</button>
      </div>
    </section>
  );
}
