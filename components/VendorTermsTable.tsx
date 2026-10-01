"use client";

import { COMMERCIAL_TERM_LABELS, CommercialTermKey, ComparisonStore, QuestionnaireAnswerQuality } from "@/lib/schema";

const TERM_ORDER: CommercialTermKey[] = ["payment_terms", "quote_validity", "taxes", "freight", "warranty", "lead_time"];

const QUALITY: Record<QuestionnaireAnswerQuality, { label: string; cls: string }> = {
  ANSWERED_WITH_PROOF: { label: "Verified detail", cls: "badge badge-ok" },
  ANSWERED_VAGUE: { label: "Vague", cls: "badge badge-warn" },
  ANSWERED_EVASIVE: { label: "Evasive", cls: "badge badge-fail" },
  UNANSWERED: { label: "No answer", cls: "badge badge-fail" },
};

function fileKind(name: string | undefined): string {
  const ext = name?.toLowerCase().split(".").pop() ?? "";
  if (["xlsx", "xls", "xlsm", "csv"].includes(ext)) return "Spreadsheet";
  if (ext === "docx") return "Word document";
  if (ext === "pdf") return "PDF";
  if (["txt", "eml", "md"].includes(ext)) return "Email";
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return "Photo";
  return "Open file";
}

/** Minimum quote validity in days, read from the RFx's own terms (e.g. "At least 15 days"). */
function minValidityDays(store: ComparisonStore): number | null {
  const t = store.rfx?.terms.find((x) => /validity/i.test(x.label));
  const m = t?.requirement.match(/(\d+)\s*day/i);
  return m ? parseInt(m[1], 10) : null;
}

function validityCheck(value: string, min: number | null): string | null {
  if (min === null) return null;
  const m = value.match(/(\d+)\s*day/i);
  if (!m) return /no fixed|not stated/i.test(value) ? "No firm validity" : null;
  return parseInt(m[1], 10) < min ? `Below the ${min}-day minimum` : null;
}

/**
 * Commercial terms, questionnaire answers and the response document for
 * every vendor, side by side -- the non-price half of the comparison.
 * Hover any value to see the vendor's own wording.
 */
export function VendorTermsTable({
  store,
  onOpenFile,
}: {
  store: ComparisonStore;
  onOpenFile: (vendorId: string) => void;
}) {
  const minDays = minValidityDays(store);
  const verdict = (vendorId: string) => store.questionnaire_verdicts.find((v) => v.vendor_id === vendorId);
  const questionnaire = store.rfx?.questionnaire ?? [];

  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <table className="data-table" style={{ minWidth: 900, tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: 230 }} />
          {store.vendors.map((v) => (
            <col key={v.vendor_id} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th>Terms &amp; qualification</th>
            {store.vendors.map((v) => (
              <th key={v.vendor_id} style={{ textTransform: "none", letterSpacing: 0, fontSize: 12.5, color: "var(--ink)" }}>
                {v.full_name.split(" ").slice(0, 2).join(" ")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="muted">Response document</td>
            {store.vendors.map((v) => (
              <td key={v.vendor_id}>
                <button
                  onClick={() => onOpenFile(v.vendor_id)}
                  title={store.vendor_files?.[v.vendor_id]}
                  style={{ border: "none", background: "none", padding: 0, color: "var(--accent)", textAlign: "left", fontSize: 12.5 }}
                >
                  {fileKind(store.vendor_files?.[v.vendor_id])} ↗
                </button>
              </td>
            ))}
          </tr>
          {TERM_ORDER.map((key) => (
            <tr key={key}>
              <td className="muted">{COMMERCIAL_TERM_LABELS[key]}</td>
              {store.vendors.map((v) => {
                const term = store.vendor_terms?.[v.vendor_id]?.find((t) => t.key === key);
                const warning = key === "quote_validity" && term ? validityCheck(term.value, minDays) : null;
                return (
                  <td key={v.vendor_id} title={term ? `"${term.source_excerpt}" (${term.source_location})` : undefined}>
                    {term ? term.value : <span className="muted">Not stated</span>}
                    {warning && (
                      <div>
                        <span className="badge badge-warn" style={{ marginTop: 4 }}>{warning}</span>
                      </div>
                    )}
                    {key === "taxes" && term && /inclusive|incl\./i.test(term.value) && (
                      <div>
                        <span className="badge badge-warn" style={{ marginTop: 4 }}>Prices include GST</span>
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
          <tr>
            <td style={{ fontWeight: 600, background: "#fbfaf7" }} colSpan={store.vendors.length + 1}>
              Supplier questionnaire
            </td>
          </tr>
          {questionnaire.map((q) => (
            <tr key={q.id}>
              <td className="muted">
                {q.question}
                {q.critical && <div><span className="badge badge-warn" style={{ marginTop: 4 }}>Required to qualify</span></div>}
              </td>
              {store.vendors.map((v) => {
                const a = verdict(v.vendor_id)?.answers.find((x) => x.question_id === q.id || x.question === q.question);
                if (!a) return <td key={v.vendor_id} className="muted">—</td>;
                const qual = QUALITY[a.quality];
                return (
                  <td key={v.vendor_id} title={a.notes ?? undefined}>
                    <span className={qual.cls}>{qual.label}</span>
                    {a.quality !== "UNANSWERED" && (
                      <div style={{ fontSize: 12, marginTop: 4, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {a.raw_answer}
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
