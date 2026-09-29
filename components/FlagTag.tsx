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
