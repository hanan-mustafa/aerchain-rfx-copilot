"use client";

import { useState } from "react";
import { VendorMeta, VendorQuestionnaireVerdict } from "@/lib/schema";

const GATE_LABEL: Record<string, string> = { PASS: "Qualified", BORDERLINE: "Borderline", FAIL: "Not qualified" };

const GATE_COLOR: Record<string, { fg: string; bg: string }> = {
  PASS: { fg: "var(--ok)", bg: "var(--ok-dim)" },
  BORDERLINE: { fg: "var(--warn)", bg: "var(--warn-dim)" },
  FAIL: { fg: "var(--fail)", bg: "var(--fail-dim)" },
};

const QUALITY_LABEL: Record<string, string> = {
  ANSWERED_WITH_PROOF: "· verified detail",
  ANSWERED_VAGUE: "· vague",
  ANSWERED_EVASIVE: "· evasive",
  UNANSWERED: "· no answer",
};

export function QuestionnaireStrip({
  vendors,
  verdicts,
}: {
  vendors: VendorMeta[];
  verdicts: VendorQuestionnaireVerdict[];
}) {
  const [openVendor, setOpenVendor] = useState<string | null>(null);

  return (
    <div style={{ borderBottom: "1px solid var(--line)", paddingBottom: "14px", marginBottom: "18px" }}>
      <div style={{ fontSize: "12px", color: "var(--ink-dim)", marginBottom: "8px" }}>
        Qualification · select a vendor to see why
      </div>
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        {vendors.map((v) => {
          const verdict = verdicts.find((x) => x.vendor_id === v.vendor_id);
          const color = verdict ? GATE_COLOR[verdict.gate_result] : { fg: "var(--ink-dim)", bg: "transparent" };
          return (
            <button
              key={v.vendor_id}
              onClick={() => setOpenVendor(openVendor === v.vendor_id ? null : v.vendor_id)}
              style={{
                border: `1px solid ${openVendor === v.vendor_id ? color.fg : "var(--line)"}`,
                background: color.bg,
                color: color.fg,
                borderRadius: "4px",
                padding: "6px 10px",
                fontSize: "13px",
                fontWeight: 500,
                textAlign: "left",
              }}
            >
              {v.full_name.split(" ")[0]} · {verdict ? GATE_LABEL[verdict.gate_result] : "…"}
            </button>
          );
        })}
      </div>
      {openVendor && (
        <div
          style={{
            marginTop: "10px",
            padding: "10px 12px",
            background: "var(--paper-raised)",
            border: "1px solid var(--line)",
            borderRadius: "4px",
            fontSize: "13px",
          }}
        >
          {(() => {
            const verdict = verdicts.find((v) => v.vendor_id === openVendor);
            if (!verdict) return null;
            return (
              <div>
                <div style={{ fontWeight: 600, marginBottom: "6px" }}>
                  {verdict.gate_reasons.join(" ")}
                </div>
                <ul style={{ margin: 0, paddingLeft: "18px" }}>
                  {verdict.answers.map((a, i) => (
                    <li key={i} style={{ marginBottom: "6px" }}>
                      <span style={{ color: "var(--ink-dim)" }}>{a.question}</span>
                      <br />
                      <span>{a.raw_answer}</span>{" "}
                      <span
                        style={{
                          fontSize: "11px",
                          color:
                            a.quality === "ANSWERED_WITH_PROOF"
                              ? "var(--ok)"
                              : a.quality === "UNANSWERED"
                              ? "var(--fail)"
                              : "var(--warn)",
                        }}
                      >
                        {QUALITY_LABEL[a.quality]}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
