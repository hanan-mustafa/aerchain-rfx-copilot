import Anthropic from "@anthropic-ai/sdk";
import { ComparisonStore, NormalizedLine } from "../schema";
import { VENDORS } from "../rfxData";

// vendor_id params are constrained to the real ids: on a free-text field the
// model passed "Global IT" instead of "global_it" and got back an empty total.
const VENDOR_IDS = VENDORS.map((v) => v.vendor_id);
const vendorIdSchema = {
  type: "string",
  enum: VENDOR_IDS,
  description: `One of: ${VENDORS.map((v) => `${v.vendor_id} (${v.full_name})`).join(", ")}.`,
} as const;

/**
 * DESIGN PRINCIPLE: the analyst agent never does arithmetic "in its head."
 * Every number in a chat answer must come from calling one of these
 * functions, which read the ComparisonStore and compute deterministically.
 * This is what makes the chat's answers trustworthy in the same way the
 * comparison table is -- both read the same normalized, provenance-tagged
 * data, and neither re-interprets a raw document from scratch.
 */

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "get_line_comparison",
    description:
      "Get every vendor's price, flags, and source info for one specific RFx line item number. Use this to answer 'who's cheapest on line X' or 'what did each vendor quote for the docking station'.",
    input_schema: {
      type: "object",
      properties: {
        line_ref: { type: "number", description: "The RFx line item number (1-30)." },
      },
      required: ["line_ref"],
    },
  },
  {
    name: "compute_cheapest_per_line",
    description:
      "Compute the cheapest vendor for every RFx line item, optionally restricted to a set of vendor_ids (e.g. only vendors that passed the questionnaire gate) and a pricing basis. Skips lines where a vendor's price is null/unresolved -- never estimates a missing price.",
    input_schema: {
      type: "object",
      properties: {
        vendor_ids: {
          type: "array",
          items: { type: "string", enum: VENDOR_IDS },
          description: "Optional: restrict comparison to these vendor_ids only. Omit to consider all vendors.",
        },
        basis: {
          type: "string",
          enum: ["headline", "best_available"],
          description:
            "'headline' uses each vendor's standard normalized price. 'best_available' uses the alternate (e.g. rebate-adjusted) basis when a vendor has one, otherwise falls back to headline.",
        },
      },
    },
  },
  {
    name: "get_vendor_total",
    description:
      "Get a vendor's total quoted value across all RFx lines they actually priced, plus counts of lines that are NOT_QUOTED or unresolved/ambiguous for that vendor. Never includes a guessed value for missing lines.",
    input_schema: {
      type: "object",
      properties: {
        vendor_id: vendorIdSchema,
        basis: { type: "string", enum: ["headline", "best_available"] },
      },
      required: ["vendor_id"],
    },
  },
  {
    name: "filter_vendors_by_questionnaire",
    description:
      "Get the list of vendor_ids whose questionnaire gate result matches or exceeds a minimum bar (e.g. only PASS, or PASS+BORDERLINE). Use this before computing 'cheapest among qualified vendors' style questions.",
    input_schema: {
      type: "object",
      properties: {
        min_result: {
          type: "string",
          enum: ["PASS", "BORDERLINE"],
          description: "'PASS' returns only vendors that fully passed. 'BORDERLINE' returns vendors that passed OR were borderline (excludes only FAIL).",
        },
      },
      required: ["min_result"],
    },
  },
  {
    name: "get_questionnaire_verdict",
    description: "Get the full questionnaire verdict (gate result, reasons, and per-question classifications) for one vendor.",
    input_schema: {
      type: "object",
      properties: { vendor_id: vendorIdSchema },
      required: ["vendor_id"],
    },
  },
  {
    name: "list_lines_with_flag",
    description:
      "List every (vendor, line) pair carrying a specific flag -- e.g. find every UNIT_MISMATCH, every CONDITIONAL_PRICING, or every UNRESOLVED_AMBIGUOUS line across all vendors. Use this to answer 'what needs a human to look at before we can award this'.",
    input_schema: {
      type: "object",
      properties: {
        flag: {
          type: "string",
          enum: [
            "OK",
            "LOW_CONFIDENCE",
            "UNIT_MISMATCH",
            "CURRENCY_CONVERTED",
            "NOT_QUOTED",
            "UNRESOLVED_AMBIGUOUS",
            "CONDITIONAL_PRICING",
          ],
        },
      },
      required: ["flag"],
    },
  },
];

function getLine(store: ComparisonStore, vendorId: string, lineRef: number): NormalizedLine | undefined {
  return store.normalized_lines.find((l) => l.vendor_id === vendorId && l.line_ref === lineRef);
}

function effectivePrice(line: NormalizedLine, basis: "headline" | "best_available"): number | null {
  if (basis === "best_available" && line.alternate_basis) {
    return line.alternate_basis.unit_price_inr;
  }
  return line.normalized_unit_price_inr;
}

function unknownVendorIds(store: ComparisonStore, ids: string[]): string[] {
  const known = new Set(store.vendors.map((v) => v.vendor_id));
  return ids.filter((id) => !known.has(id));
}

export function executeToolCall(
  store: ComparisonStore,
  toolName: string,
  input: any
): any {
  // Fail loudly on a bad vendor_id instead of computing over zero lines.
  const requestedIds: string[] = [
    ...(typeof input?.vendor_id === "string" ? [input.vendor_id] : []),
    ...(Array.isArray(input?.vendor_ids) ? input.vendor_ids : []),
  ];
  const unknown = unknownVendorIds(store, requestedIds);
  if (unknown.length > 0) {
    return {
      error: `Unknown vendor_id(s): ${unknown.join(", ")}. Valid vendor_ids: ${store.vendors.map((v) => v.vendor_id).join(", ")}.`,
    };
  }

  switch (toolName) {
    case "get_line_comparison": {
      const lineRef = input.line_ref as number;
      const spec = store.line_items.find((li) => li.no === lineRef);
      const rows = store.vendors.map((v) => {
        const line = getLine(store, v.vendor_id, lineRef);
        return {
          vendor_id: v.vendor_id,
          vendor_name: v.full_name,
          unit_price_inr: line?.normalized_unit_price_inr ?? null,
          flags: line?.flags ?? [],
          resolvable: line?.resolvable ?? false,
          source_excerpt: line?.source_excerpt ?? null,
          conversion_notes: line?.conversion_notes ?? [],
        };
      });
      return { line_item: spec, vendor_quotes: rows };
    }

    case "compute_cheapest_per_line": {
      const vendorIds: string[] = input.vendor_ids ?? store.vendors.map((v) => v.vendor_id);
      const basis: "headline" | "best_available" = input.basis ?? "headline";
      type Candidate = { vendor_id: string; unit_price_inr: number; flags: string[] };
      const results = store.line_items.map((li) => {
        const candidates: Candidate[] = [];
        for (const vid of vendorIds) {
          const line = getLine(store, vid, li.no);
          if (!line || !line.resolvable) continue;
          const price = effectivePrice(line, basis);
          if (price === null) continue;
          candidates.push({ vendor_id: vid, unit_price_inr: price, flags: line.flags });
        }

        if (candidates.length === 0) {
          return { line_ref: li.no, item: li.item, cheapest: null, note: "No resolvable price from any considered vendor." };
        }
        candidates.sort((a, b) => a.unit_price_inr - b.unit_price_inr);
        return {
          line_ref: li.no,
          item: li.item,
          cheapest: candidates[0],
          all_considered: candidates,
        };
      });
      return { basis, vendor_ids_considered: vendorIds, results };
    }

    case "get_vendor_total": {
      const vendorId = input.vendor_id as string;
      const basis: "headline" | "best_available" = input.basis ?? "headline";
      const lines = store.normalized_lines.filter((l) => l.vendor_id === vendorId);
      let total = 0;
      let pricedLines = 0;
      let notQuoted = 0;
      let unresolved = 0;
      const lowConfidenceIncluded: number[] = [];
      for (const l of lines) {
        if (l.flags.includes("NOT_QUOTED")) {
          notQuoted++;
          continue;
        }
        if (!l.resolvable) {
          unresolved++;
          continue;
        }
        const price = effectivePrice(l, basis);
        const spec = store.line_items.find((li) => li.no === l.line_ref);
        if (price !== null && spec) {
          total += price * spec.qty;
          pricedLines++;
          if (l.flags.includes("LOW_CONFIDENCE") || l.flags.includes("UNIT_MISMATCH")) lowConfidenceIncluded.push(l.line_ref);
        }
      }
      return {
        vendor_id: vendorId,
        basis,
        total_inr: total,
        lines_priced: pricedLines,
        lines_not_quoted: notQuoted,
        lines_unresolved_ambiguous: unresolved,
        // Priced lines that went into the total but still carry a review flag.
        included_lines_needing_review: lowConfidenceIncluded,
        note:
          pricedLines < store.line_items.length
            ? `Total covers ${pricedLines} of ${store.line_items.length} lines; it excludes ${notQuoted} not-quoted, ${unresolved} unresolved/ambiguous and ${store.line_items.length - pricedLines - notQuoted - unresolved} unpriceable (e.g. unit could not be converted) line(s) -- this is NOT a like-for-like total against a vendor who priced every line.`
            : `All ${store.line_items.length} lines were resolvable and included.` +
              (lowConfidenceIncluded.length > 0
                ? ` But line(s) ${lowConfidenceIncluded.join(", ")} carry LOW_CONFIDENCE/UNIT_MISMATCH and should be checked before relying on this total.`
                : ""),
      };
    }

    case "filter_vendors_by_questionnaire": {
      const minResult = input.min_result as "PASS" | "BORDERLINE";
      const allowed = minResult === "PASS" ? ["PASS"] : ["PASS", "BORDERLINE"];
      const vendorIds = store.questionnaire_verdicts
        .filter((v) => allowed.includes(v.gate_result))
        .map((v) => v.vendor_id);
      return { min_result: minResult, qualifying_vendor_ids: vendorIds };
    }

    case "get_questionnaire_verdict": {
      const vendorId = input.vendor_id as string;
      const verdict = store.questionnaire_verdicts.find((v) => v.vendor_id === vendorId);
      return verdict ?? { error: `No questionnaire verdict found for vendor_id ${vendorId}` };
    }

    case "list_lines_with_flag": {
      const flag = input.flag as string;
      const matches = store.normalized_lines
        .filter((l) => l.flags.includes(flag as any))
        .map((l) => ({
          vendor_id: l.vendor_id,
          line_ref: l.line_ref,
          item: store.line_items.find((li) => li.no === l.line_ref)?.item,
          normalized_unit_price_inr: l.normalized_unit_price_inr,
          source_excerpt: l.source_excerpt,
        }));
      return { flag, matches };
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}
