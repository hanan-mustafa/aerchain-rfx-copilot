import { ConfidenceFlag } from "@/lib/schema";

const FLAG_STYLE: Record<ConfidenceFlag, { label: string; bg: string; fg: string }> = {
  OK: { label: "ok", bg: "transparent", fg: "var(--ink-dim)" },
  LOW_CONFIDENCE: { label: "low confidence", bg: "var(--warn-dim)", fg: "var(--warn)" },
  UNIT_MISMATCH: { label: "unit mismatch", bg: "var(--warn-dim)", fg: "var(--warn)" },
  CURRENCY_CONVERTED: { label: "currency converted", bg: "var(--accent-dim)", fg: "var(--accent)" },
  NOT_QUOTED: { label: "not quoted", bg: "var(--fail-dim)", fg: "var(--fail)" },
  UNRESOLVED_AMBIGUOUS: { label: "ambiguous", bg: "var(--fail-dim)", fg: "var(--fail)" },
  CONDITIONAL_PRICING: { label: "conditional", bg: "var(--warn-dim)", fg: "var(--warn)" },
};

export function FlagTag({ flag }: { flag: ConfidenceFlag }) {
  if (flag === "OK") return null;
  const style = FLAG_STYLE[flag];
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: "11px",
        padding: "1px 6px",
        borderRadius: "3px",
        background: style.bg,
        color: style.fg,
        marginRight: "4px",
        marginTop: "3px",
        fontFamily: "var(--font-body)",
        fontWeight: 500,
      }}
    >
      {style.label}
    </span>
  );
}

/** Plain-English meaning of each flag, shown in the source drawer. */
export const FLAG_EXPLANATION: Record<ConfidenceFlag, string> = {
  OK: "Clean extraction, matched one-to-one to this RFx line.",
  LOW_CONFIDENCE:
    "The extractor was unsure of this value (approximate wording, a hard-to-read photo, a self-contradicting document, or two independent reads that disagreed). Check the source before relying on it.",
  UNIT_MISMATCH:
    "The vendor priced this in a different unit than the RFx asks for. Where the unit could be parsed (e.g. per box of 10), the price was converted in code; otherwise it was left blank for review.",
  CURRENCY_CONVERTED: "The vendor quoted in a foreign currency. Converted to INR in code at the RFx's frozen exchange rate.",
  NOT_QUOTED: "The vendor did not price this line.",
  UNRESOLVED_AMBIGUOUS:
    "One vendor figure covers several RFx lines (e.g. an average across laptop tiers). The system does not invent a split, so there is no comparable per-line price.",
  CONDITIONAL_PRICING:
    "The price depends on a condition (e.g. an early-payment rebate). Both the headline and the conditional price are shown; the buyer chooses which to compare on.",
};
