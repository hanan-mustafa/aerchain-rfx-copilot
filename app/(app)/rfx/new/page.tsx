"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { buildInvitation, useWorkspace, WorkspaceRfx } from "@/lib/workspace";
import { emptyDraft, RFX_TEMPLATES } from "@/lib/rfxTemplates";
import { SAMPLE_VENDORS } from "@/lib/rfxData";
import { LineItemSpec, QuestionnaireItem, RfxDefinition, RfxTerm, VendorMeta } from "@/lib/schema";
import { downloadRfxPack } from "@/lib/downloads";

const BUYER_ORG = "BuyerCo Procurement";

interface CopilotMsg {
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
}

const COPILOT_PROGRESS = ["Reading your brief…", "Drafting line items…", "Writing the supplier questionnaire…", "Setting commercial terms…", "Finishing the draft…"];

export default function NewRfxPage() {
  return (
    <Suspense fallback={<div className="empty">Loading…</div>}>
      <RfxComposer />
    </Suspense>
  );
}

function RfxComposer() {
  const router = useRouter();
  const search = useSearchParams();
  const ws = useWorkspace();
  const id = search.get("id");
  const entry = id ? ws.get(id) : undefined;

  const [draft, setDraft] = useState<RfxDefinition | null>(null);
  const [vendors, setVendors] = useState<VendorMeta[]>([]);
  const [messages, setMessages] = useState<CopilotMsg[]>([]);
  const [thinking, setThinking] = useState(false);
  const [sending, setSending] = useState(false);
  const loadedFor = useRef<string | null>(null);
  const pendingNav = useRef<string | null>(null); // draft id we're navigating to

  // "New RFx" clicked while editing a draft: start over (but not while a
  // just-created draft is still on its way into the URL).
  useEffect(() => {
    if (draft && id === draft.rfx_id) pendingNav.current = null;
    if (!id && draft && pendingNav.current !== draft.rfx_id) {
      setDraft(null);
      setVendors([]);
      setMessages([]);
      loadedFor.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Load an existing draft once the workspace is ready.
  useEffect(() => {
    if (!ws.ready || !id || loadedFor.current === id) return;
    loadedFor.current = id;
    if (entry) {
      if (entry.status !== "draft") {
        router.replace(`/rfx/${encodeURIComponent(id)}`);
        return;
      }
      setDraft(entry.rfx);
      setVendors(entry.vendors);
      try {
        setMessages(JSON.parse(window.localStorage.getItem(`rfx-copilot.copilot.${id}`) ?? "[]"));
      } catch {
        setMessages([]);
      }
    }
  }, [ws.ready, id, entry, router]);

  // Autosave the draft to the workspace.
  useEffect(() => {
    if (!draft) return;
    const record: WorkspaceRfx = { rfx: draft, status: "draft", vendors, invitations: [], responses: {}, is_sample: false, updated_at: "" };
    ws.upsert(record);
    if (id !== draft.rfx_id) {
      loadedFor.current = draft.rfx_id;
      pendingNav.current = draft.rfx_id;
      router.replace(`/rfx/new?id=${encodeURIComponent(draft.rfx_id)}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, vendors]);

  useEffect(() => {
    if (draft) {
      try {
        window.localStorage.setItem(`rfx-copilot.copilot.${draft.rfx_id}`, JSON.stringify(messages));
      } catch {
        // storage unavailable
      }
    }
  }, [messages, draft]);

  async function askCopilot(text: string, base?: RfxDefinition) {
    const current = base ?? draft ?? emptyDraft(BUYER_ORG);
    if (!draft) setDraft(current);
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setThinking(true);
    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: current, history: next.filter((m) => !m.isError).map(({ role, content }) => ({ role, content })) }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setDraft(data.draft);
      setMessages([...next, { role: "assistant", content: data.message }]);
    } catch (e: any) {
      const msg = /credit balance/i.test(e.message ?? "")
        ? "The co-pilot is unavailable: the AI account is out of credits. You can still start from a template and edit the draft by hand."
        : `The co-pilot couldn't update the draft: ${e.message}`;
      setMessages([...next, { role: "assistant", content: msg, isError: true }]);
    } finally {
      setThinking(false);
    }
  }

  function applyTemplate(templateId: string) {
    const t = RFX_TEMPLATES.find((x) => x.id === templateId)!;
    const base = draft ?? emptyDraft(BUYER_ORG);
    setDraft({ ...base, ...t.build() });
    if (t.id !== "blank") setMessages((m) => [...m, { role: "assistant", content: `Started from the "${t.name}" template. Edit anything on the right, or tell me what to change.` }]);
  }

  function discard() {
    if (!draft || !window.confirm("Discard this draft?")) return;
    ws.remove(draft.rfx_id);
    window.localStorage.removeItem(`rfx-copilot.copilot.${draft.rfx_id}`);
    router.push("/");
  }

  function send() {
    if (!draft) return;
    setSending(true);
    const now = new Date().toISOString();
    ws.upsert({
      rfx: draft,
      status: "open",
      vendors,
      invitations: vendors.map((v) => buildInvitation(draft, v, now)),
      responses: {},
      is_sample: false,
      updated_at: now,
    });
    router.push(`/rfx/${encodeURIComponent(draft.rfx_id)}/vendors`);
  }

  if (!ws.ready || (id && !draft && entry)) return <div className="empty">Loading…</div>;

  if (!draft) return <StartScreen onBrief={(t) => askCopilot(t)} onTemplate={applyTemplate} busy={thinking} />;

  const problems = [
    !draft.title.trim() && "Add a title",
    draft.line_items.length === 0 && "Add at least one line item",
    draft.line_items.some((l) => !l.item.trim() || !(l.qty > 0)) && "Every line item needs a name and a quantity",
    vendors.length === 0 && "Add at least one vendor",
    vendors.some((v) => !v.email?.trim()) && "Every vendor needs an email address",
  ].filter(Boolean) as string[];

  return (
    <>
      <div className="breadcrumbs">
        <Link href="/">RFxs</Link> / New RFx
      </div>
      <div className="page-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 className="page-title">{draft.title || "Untitled RFx"}</h1>
            <span className="badge">Draft</span>
          </div>
          <div className="page-subtitle">
            <span className="mono">{draft.rfx_id}</span> · saved automatically
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost btn-danger" onClick={discard}>Discard</button>
          <button className="btn" onClick={() => downloadRfxPack(draft)} disabled={draft.line_items.length === 0}>Preview Excel</button>
        </div>
      </div>

      <div className="workbench" style={{ gridTemplateColumns: "380px minmax(0, 1fr)" }}>
        <CopilotChat messages={messages} thinking={thinking} onSend={(t) => askCopilot(t)} />
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <DetailsEditor draft={draft} onChange={setDraft} />
          <LineItemsEditor items={draft.line_items} onChange={(line_items) => setDraft({ ...draft, line_items })} />
          <QuestionnaireEditor items={draft.questionnaire} onChange={(questionnaire) => setDraft({ ...draft, questionnaire })} />
          <TermsEditor items={draft.terms} onChange={(terms) => setDraft({ ...draft, terms })} />
          <VendorsEditor vendors={vendors} onChange={setVendors} />
          <section className="card card-pad">
            <div className="card-title">Review and send</div>
            <p className="muted" style={{ margin: "4px 0 12px", fontSize: 13 }}>
              Each vendor gets an email with the RFx summary, the Excel template and a personal link to reply in any format.
            </p>
            {vendors[0] && (
              <pre style={{ whiteSpace: "pre-wrap", fontFamily: "var(--font-body)", fontSize: 12.5, background: "var(--paper)", padding: 12, borderRadius: 6, margin: "0 0 12px", maxHeight: 220, overflow: "auto" }}>
                {`To: ${vendors[0].email || "—"}\nSubject: ${buildInvitation(draft, vendors[0], "").subject}\n\n${buildInvitation(draft, vendors[0], "").body}`}
              </pre>
            )}
            {problems.length > 0 && (
              <ul className="notice notice-warn" style={{ margin: "0 0 12px", paddingLeft: 28 }}>
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            <button className="btn btn-primary" disabled={problems.length > 0 || sending} onClick={send}>
              Send to {vendors.length} vendor{vendors.length === 1 ? "" : "s"}
            </button>
          </section>
        </div>
      </div>
    </>
  );
}

function StartScreen({ onBrief, onTemplate, busy }: { onBrief: (t: string) => void; onTemplate: (id: string) => void; busy: boolean }) {
  const [brief, setBrief] = useState("");
  return (
    <div style={{ maxWidth: 760, margin: "24px auto 0" }}>
      <div className="breadcrumbs">
        <Link href="/">RFxs</Link> / New RFx
      </div>
      <h1 className="page-title" style={{ fontSize: 26 }}>What do you need to buy?</h1>
      <p className="page-subtitle" style={{ fontSize: 14 }}>
        Describe it in your own words. The co-pilot drafts the line items, supplier questionnaire and commercial terms, and you refine from there.
      </p>
      <div className="card card-pad" style={{ marginTop: 16 }}>
        <textarea
          className="textarea"
          style={{ minHeight: 130, fontSize: 14, border: "none", padding: 0 }}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="e.g. We're refreshing laptops for 300 employees: 100 entry, 150 standard and 50 premium, plus monitors, docks and headsets. Need delivery to Bengaluru and Pune by March, 3-year onsite warranty."
          aria-label="Describe what you need to buy"
        />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
          <span className="muted" style={{ fontSize: 12 }}>Quantities, specs, locations and deadlines all help.</span>
          <button className="btn btn-primary" disabled={!brief.trim() || busy} onClick={() => onBrief(brief.trim())}>
            {busy ? "Drafting…" : "Draft RFx"}
          </button>
        </div>
      </div>
      <div style={{ marginTop: 22 }}>
        <div className="field-label">Or start from a template</div>
        <div className="grid-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
          {RFX_TEMPLATES.map((t) => (
            <button key={t.id} className="card card-pad" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => onTemplate(t.id)}>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>{t.name}</div>
              <div className="muted" style={{ fontSize: 12 }}>{t.description}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function CopilotChat({ messages, thinking, onSend }: { messages: CopilotMsg[]; thinking: boolean; onSend: (t: string) => void }) {
  const [input, setInput] = useState("");
  const [step, setStep] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);
  useEffect(() => {
    if (!thinking) return setStep(0);
    const t = setInterval(() => setStep((s) => Math.min(s + 1, COPILOT_PROGRESS.length - 1)), 2000);
    return () => clearInterval(t);
  }, [thinking]);

  return (
    <div className="workbench-chat card" style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--line)" }}>
        <h3 style={{ fontSize: 15 }}>Co-pilot</h3>
        <div className="muted" style={{ fontSize: 11.5 }}>Ask for changes in plain language. You can also edit the draft directly.</div>
      </div>
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.length === 0 && (
          <div className="muted" style={{ fontSize: 12.5 }}>
            Try: &ldquo;Split laptops into entry, standard and premium&rdquo;, &ldquo;Add a question about data-wipe certification and make it required&rdquo;, or &ldquo;Responses due 15 March&rdquo;.
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "90%",
              background: m.isError ? "var(--fail-dim)" : m.role === "user" ? "var(--accent-dim)" : "var(--paper)",
              color: m.isError ? "var(--fail)" : undefined,
              border: "1px solid var(--line)",
              borderRadius: 8,
              padding: "8px 10px",
              fontSize: 13,
              whiteSpace: "pre-wrap",
            }}
          >
            {m.content}
          </div>
        ))}
        {thinking && (
          <div className="chat-progress" role="status" aria-live="polite">
            <span className="chat-progress-dot" />
            <span key={step} className="chat-progress-text">{COPILOT_PROGRESS[step]}</span>
          </div>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!input.trim() || thinking) return;
          onSend(input.trim());
          setInput("");
        }}
        style={{ display: "flex", gap: 8, padding: 10, borderTop: "1px solid var(--line)" }}
      >
        <input className="input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask for a change…" aria-label="Message the co-pilot" />
        <button className="btn btn-primary" disabled={!input.trim() || thinking}>Send</button>
      </form>
    </div>
  );
}

function DetailsEditor({ draft, onChange }: { draft: RfxDefinition; onChange: (d: RfxDefinition) => void }) {
  return (
    <section className="card card-pad">
      <div className="card-title" style={{ marginBottom: 10 }}>Details</div>
      <div className="grid-2" style={{ gridTemplateColumns: "minmax(0, 2fr) minmax(160px, 1fr)" }}>
        <label>
          <span className="field-label">Title</span>
          <input className="input" value={draft.title} onChange={(e) => onChange({ ...draft, title: e.target.value })} />
        </label>
        <label>
          <span className="field-label">Responses due</span>
          <input className="input" type="date" value={draft.response_due ?? ""} onChange={(e) => onChange({ ...draft, response_due: e.target.value || null })} />
        </label>
      </div>
      <label style={{ display: "block", marginTop: 12 }}>
        <span className="field-label">Scope</span>
        <textarea className="textarea" value={draft.scope} onChange={(e) => onChange({ ...draft, scope: e.target.value })} placeholder="What's being bought, for whom, delivered where." />
      </label>
    </section>
  );
}

function LineItemsEditor({ items, onChange }: { items: LineItemSpec[]; onChange: (i: LineItemSpec[]) => void }) {
  const set = (i: number, patch: Partial<LineItemSpec>) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const renumber = (list: LineItemSpec[]) => list.map((x, j) => ({ ...x, no: j + 1 }));
  return (
    <section className="card" style={{ overflowX: "auto" }}>
      <div className="card-pad" style={{ paddingBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="card-title">Line items <span className="muted" style={{ fontWeight: 400 }}>({items.length})</span></div>
        <button className="btn btn-sm" onClick={() => onChange(renumber([...items, { no: items.length + 1, item: "", spec: "", uom: "per unit", qty: 1 }]))}>Add line</button>
      </div>
      {items.length === 0 ? (
        <div className="muted" style={{ padding: "0 18px 16px", fontSize: 13 }}>No line items yet. Describe them to the co-pilot or add them here.</div>
      ) : (
        <table className="data-table" style={{ minWidth: 680 }}>
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>Item</th>
              <th>Specification</th>
              <th style={{ width: 110 }}>Unit</th>
              <th style={{ width: 90 }}>Qty</th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {items.map((li, i) => (
              <tr key={i}>
                <td className="mono muted">{li.no}</td>
                <td><input className="input" value={li.item} onChange={(e) => set(i, { item: e.target.value })} aria-label={`Line ${li.no} item`} /></td>
                <td><input className="input" value={li.spec} onChange={(e) => set(i, { spec: e.target.value })} aria-label={`Line ${li.no} specification`} /></td>
                <td><input className="input" value={li.uom} onChange={(e) => set(i, { uom: e.target.value })} aria-label={`Line ${li.no} unit`} /></td>
                <td><input className="input mono" type="number" min={0} value={li.qty} onChange={(e) => set(i, { qty: Number(e.target.value) })} aria-label={`Line ${li.no} quantity`} /></td>
                <td><button className="btn btn-ghost btn-sm" aria-label={`Remove line ${li.no}`} onClick={() => onChange(renumber(items.filter((_, j) => j !== i)))}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function QuestionnaireEditor({ items, onChange }: { items: QuestionnaireItem[]; onChange: (i: QuestionnaireItem[]) => void }) {
  const set = (i: number, patch: Partial<QuestionnaireItem>) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <section className="card card-pad">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div className="card-title">Supplier questionnaire</div>
        <button className="btn btn-sm" onClick={() => onChange([...items, { id: `q${Date.now()}`, question: "", critical: false }])}>Add question</button>
      </div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
        Vendors who leave a required question unanswered or answer it evasively don&rsquo;t qualify; a vague answer marks them borderline.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((q, i) => (
          <div key={q.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input className="input" value={q.question} onChange={(e) => set(i, { question: e.target.value })} aria-label={`Question ${i + 1}`} />
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, whiteSpace: "nowrap" }}>
              <input type="checkbox" checked={q.critical} onChange={(e) => set(i, { critical: e.target.checked })} /> Required to qualify
            </label>
            <button className="btn btn-ghost btn-sm" aria-label={`Remove question ${i + 1}`} onClick={() => onChange(items.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
      </div>
    </section>
  );
}

function TermsEditor({ items, onChange }: { items: RfxTerm[]; onChange: (i: RfxTerm[]) => void }) {
  const set = (i: number, patch: Partial<RfxTerm>) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <section className="card card-pad">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div className="card-title">Commercial terms</div>
        <button className="btn btn-sm" onClick={() => onChange([...items, { id: `t${Date.now()}`, label: "", requirement: "" }])}>Add term</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((t, i) => (
          <div key={t.id} style={{ display: "grid", gridTemplateColumns: "minmax(120px, 1fr) minmax(0, 2.5fr) auto", gap: 8 }}>
            <input className="input" value={t.label} onChange={(e) => set(i, { label: e.target.value })} aria-label={`Term ${i + 1} name`} />
            <input className="input" value={t.requirement} onChange={(e) => set(i, { requirement: e.target.value })} aria-label={`Term ${i + 1} requirement`} />
            <button className="btn btn-ghost btn-sm" aria-label={`Remove term ${i + 1}`} onClick={() => onChange(items.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
      </div>
    </section>
  );
}

function VendorsEditor({ vendors, onChange }: { vendors: VendorMeta[]; onChange: (v: VendorMeta[]) => void }) {
  const set = (i: number, patch: Partial<VendorMeta>) => onChange(vendors.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const suggestions = SAMPLE_VENDORS.filter((s) => !vendors.some((v) => v.vendor_id === s.vendor_id));
  const add = (v?: VendorMeta) => {
    const vendor: VendorMeta = v
      ? { vendor_id: v.vendor_id, full_name: v.full_name, contact: v.contact.split(",")[0].replace(/\s*\(.*\)$/, ""), email: v.email, source_format: "email", source_file: "" }
      : { vendor_id: `vendor_${Date.now()}`, full_name: "", contact: "", email: "", source_format: "email", source_file: "" };
    onChange([...vendors, vendor]);
  };
  return (
    <section className="card card-pad">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div className="card-title">Vendors to invite <span className="muted" style={{ fontWeight: 400 }}>({vendors.length})</span></div>
        <button className="btn btn-sm" onClick={() => add()}>Add vendor</button>
      </div>
      {suggestions.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
          <span className="muted" style={{ fontSize: 12 }}>From your supplier list:</span>
          {suggestions.map((s) => (
            <button key={s.vendor_id} className="badge" style={{ cursor: "pointer" }} onClick={() => add(s)}>
              + {s.full_name}
            </button>
          ))}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {vendors.map((v, i) => (
          <div key={v.vendor_id} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1.4fr) auto", gap: 8 }}>
            <input className="input" placeholder="Company" value={v.full_name} onChange={(e) => set(i, { full_name: e.target.value })} aria-label="Vendor company" />
            <input className="input" placeholder="Contact" value={v.contact} onChange={(e) => set(i, { contact: e.target.value })} aria-label="Vendor contact" />
            <input className="input" placeholder="Email" type="email" value={v.email ?? ""} onChange={(e) => set(i, { email: e.target.value })} aria-label="Vendor email" />
            <button className="btn btn-ghost btn-sm" aria-label="Remove vendor" onClick={() => onChange(vendors.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
      </div>
    </section>
  );
}
