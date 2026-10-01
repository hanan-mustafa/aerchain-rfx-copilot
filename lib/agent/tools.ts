import Anthropic from "@anthropic-ai/sdk";
import { COMMERCIAL_TERM_LABELS, ComparisonStore, NormalizedLine } from "../schema";
import { Basis, BASIS_LABEL, ELIGIBILITY_LABEL, Eligibility, cheapestPerLine, eligibleVendors, singleVendor, standardScenarios } from "../award";

/**
 * Charts and exports the analyst produces. Tools compute them in code; the
 * chat UI renders charts and turns exports into downloads. Only a short
 * summary goes back to the model, never the full rows.
 */
export interface ChartArtifact {
  type: "chart";
  title: string;
  subtitle?: string;
  unit: "INR";
  bars: { label: string; value: number; note?: string; highlight?: boolean }[];
}
export interface ExportArtifact {
  type: "export";
  title: string;
  filename: string;
  sheets: { name: string; rows: (string | number | null)[][] }[];
}
export type Artifact = ChartArtifact | ExportArtifact;

/**
 * DESIGN PRINCIPLE: the analyst agent never does arithmetic "in its head."
 * Every number in a chat answer must come from calling one of these
 * functions, which read the ComparisonStore and compute deterministically.
 * This is what makes the chat's answers trustworthy in the same way the
 * comparison table is -- both read the same normalized, provenance-tagged
 * data, and neither re-interprets a raw document from scratch.
 */

/**
 * Tool definitions for one comparison. vendor_id params are constrained to
 * the vendors actually in it: on a free-text field the model once passed
 * "Global IT" instead of "global_it" and got back an empty total.
 */
export function buildToolDefinitions(store: ComparisonStore): Anthropic.Tool[] {
  const VENDOR_IDS = store.vendors.map((v) => v.vendor_id);
  const vendorIdSchema = {
    type: "string",
    enum: VENDOR_IDS,
    description: `One of: ${store.vendors.map((v) => `${v.vendor_id} (${v.full_name})`).join(", ")}.`,
  } as const;
  const basisSchema = {
    type: "string",
    enum: ["headline", "best_available"],
    description: "'headline' = standard prices. 'best_available' = net of conditional rebates where a vendor offers one.",
  } as const;
  const eligibilitySchema = {
    type: "string",
    enum: ["PASS", "PASS_BORDERLINE", "ALL"],
    description: "Which vendors may win: only those that passed the questionnaire gate, passed or borderline, or all.",
  } as const;
  return [
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
  {
    name: "compute_award_scenario",
    description:
      "Compute an award scenario in code: either everything to one vendor, or a split award giving each line to the lowest-priced eligible vendor. Returns the total, how many lines each vendor wins, lines no eligible vendor priced, and awarded lines that still need review. Use this for any award total or split-award question.",
    input_schema: {
      type: "object",
      properties: {
        strategy: { type: "string", enum: ["single_vendor", "cheapest_per_line"] },
        vendor_id: { ...vendorIdSchema, description: "Required for single_vendor." },
        eligibility: eligibilitySchema,
        basis: basisSchema,
      },
      required: ["strategy"],
    },
  },
  {
    name: "compare_award_scenarios",
    description:
      "Every standard award scenario side by side (each vendor alone, plus split awards at each eligibility level) with totals, coverage and review counts. Use for 'what are our options' or 'what's the cheapest way to award this'.",
    input_schema: { type: "object", properties: { basis: basisSchema } },
  },
  {
    name: "get_commercial_terms",
    description:
      "Each vendor's stated commercial terms (payment, validity, freight, GST treatment, warranty, lead time) with the vendor's own wording. Use for questions about terms, GST, payment or delivery.",
    input_schema: { type: "object", properties: { vendor_id: { ...vendorIdSchema, description: "Optional: one vendor only." } } },
  },
  {
    name: "make_chart",
    description:
      "Show a bar chart in the chat, computed from the comparison data. 'vendor_totals': each vendor's total for the lines they priced. 'line_prices': every vendor's unit price on one line. 'award_scenarios': totals of the standard award scenarios. Call this whenever the buyer asks for a chart, graph or visual comparison.",
    input_schema: {
      type: "object",
      properties: {
        chart: { type: "string", enum: ["vendor_totals", "line_prices", "award_scenarios"] },
        line_ref: { type: "number", description: "Required for line_prices." },
        basis: basisSchema,
      },
      required: ["chart"],
    },
  },
  {
    name: "make_export",
    description:
      "Prepare an Excel download for the buyer, computed from the comparison data. 'comparison': every vendor's price per line with flags. 'award_scenario': the line-by-line allocation for one scenario (same inputs as compute_award_scenario). 'questionnaire': every vendor's answers and qualification. Call this whenever the buyer asks to export, download or get a spreadsheet.",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["comparison", "award_scenario", "questionnaire"] },
        strategy: { type: "string", enum: ["single_vendor", "cheapest_per_line"] },
        vendor_id: vendorIdSchema,
        eligibility: eligibilitySchema,
        basis: basisSchema,
      },
      required: ["kind"],
    },
  },
  ];
}

function vendorName(store: ComparisonStore, id: string): string {
  return store.vendors.find((v) => v.vendor_id === id)?.full_name ?? id;
}

function shortName(store: ComparisonStore, id: string): string {
  return vendorName(store, id).split(" ").slice(0, 2).join(" ");
}

function scenarioFromInput(store: ComparisonStore, input: any) {
  const basis: Basis = input.basis ?? "headline";
  if (input.strategy === "single_vendor") {
    if (!input.vendor_id) return { error: "single_vendor needs a vendor_id." } as const;
    return singleVendor(store, input.vendor_id, basis);
  }
  const eligibility: Eligibility = input.eligibility ?? "ALL";
  return cheapestPerLine(store, eligibleVendors(store, eligibility), basis, eligibility);
}

/** A tool result plus, for charts and exports, the artifact the chat UI renders. */
export interface ToolOutcome {
  result: any; // what the model sees
  artifact?: Artifact;
}

export function runTool(store: ComparisonStore, toolName: string, input: any): ToolOutcome {
  // Fail loudly on a bad vendor_id instead of computing over zero lines.
  const requested: string[] = [
    ...(typeof input?.vendor_id === "string" ? [input.vendor_id] : []),
    ...(Array.isArray(input?.vendor_ids) ? input.vendor_ids : []),
  ];
  const unknown = unknownVendorIds(store, requested);
  if (unknown.length > 0) {
    return { result: { error: `Unknown vendor_id(s): ${unknown.join(", ")}. Valid vendor_ids: ${store.vendors.map((v) => v.vendor_id).join(", ")}.` } };
  }
  switch (toolName) {
    case "compute_award_scenario": {
      const sc = scenarioFromInput(store, input);
      if ("error" in sc) return { result: sc };
      return {
        result: {
          scenario: sc.label,
          basis: BASIS_LABEL[sc.basis],
          eligibility: ELIGIBILITY_LABEL[sc.eligibility],
          total_inr: Math.round(sc.total_inr),
          lines_awarded: sc.allocations.length,
          lines_won_by_vendor: Object.fromEntries(
            sc.vendors_used.map((v) => [v, sc.allocations.filter((a) => a.vendor_id === v).length])
          ),
          value_by_vendor_inr: Object.fromEntries(
            sc.vendors_used.map((v) => [v, Math.round(sc.allocations.filter((a) => a.vendor_id === v).reduce((s, a) => s + a.line_total_inr, 0))])
          ),
          uncovered_lines: sc.uncovered_lines,
          awarded_lines_needing_review: sc.review_lines,
        },
      };
    }
    case "compare_award_scenarios": {
      const basis: Basis = input.basis ?? "headline";
      return {
        result: {
          basis: BASIS_LABEL[basis],
          scenarios: standardScenarios(store, basis).map((sc) => ({
            scenario: sc.label,
            total_inr: Math.round(sc.total_inr),
            vendors_used: sc.vendors_used,
            lines_covered: `${sc.allocations.length} of ${store.line_items.length}`,
            uncovered_lines: sc.uncovered_lines,
            lines_needing_review: sc.review_lines.length,
          })),
          note: "A total that doesn't cover every line isn't comparable with one that does.",
        },
      };
    }
    case "get_commercial_terms": {
      const ids = input.vendor_id ? [input.vendor_id] : store.vendors.map((v) => v.vendor_id);
      return {
        result: ids.map((id) => ({
          vendor_id: id,
          terms: (store.vendor_terms?.[id] ?? []).map((t) => ({ term: COMMERCIAL_TERM_LABELS[t.key], value: t.value, vendor_wording: t.source_excerpt })),
          rfx_requirements: store.rfx?.terms.map((t) => `${t.label}: ${t.requirement}`),
        })),
      };
    }
    case "make_chart": {
      const basis: Basis = input.basis ?? "headline";
      let artifact: ChartArtifact;
      if (input.chart === "line_prices") {
        const li = store.line_items.find((l) => l.no === input.line_ref);
        if (!li) return { result: { error: `No line ${input.line_ref}.` } };
        const bars = store.vendors
          .map((v) => {
            const line = getLine(store, v.vendor_id, li.no);
            const p = line ? (basis === "best_available" && line.alternate_basis ? line.alternate_basis.unit_price_inr : line.normalized_unit_price_inr) : null;
            return p === null || !line?.resolvable ? null : { label: shortName(store, v.vendor_id), value: Math.round(p) };
          })
          .filter((b): b is { label: string; value: number } => b !== null);
        const min = Math.min(...bars.map((b) => b.value));
        artifact = {
          type: "chart",
          title: `Line ${li.no}: ${li.item}`,
          subtitle: `Unit price, INR (${BASIS_LABEL[basis].toLowerCase()})`,
          unit: "INR",
          bars: bars.map((b) => ({ ...b, highlight: b.value === min })),
        };
      } else if (input.chart === "award_scenarios") {
        const scs = standardScenarios(store, basis);
        const full = scs.filter((s) => s.uncovered_lines.length === 0);
        const min = full.length ? Math.min(...full.map((s) => s.total_inr)) : null;
        artifact = {
          type: "chart",
          title: "Award scenarios",
          subtitle: `Total award value, INR (${BASIS_LABEL[basis].toLowerCase()})`,
          unit: "INR",
          bars: scs.map((s) => ({
            label: s.strategy === "single_vendor" ? shortName(store, s.vendor_ids[0]) : `Split: ${ELIGIBILITY_LABEL[s.eligibility].toLowerCase()}`,
            value: Math.round(s.total_inr),
            note: s.uncovered_lines.length ? `${s.uncovered_lines.length} lines not covered` : undefined,
            highlight: min !== null && s.total_inr === min && s.uncovered_lines.length === 0,
          })),
        };
      } else {
        const bars = store.vendors.map((v) => {
          const sc = singleVendor(store, v.vendor_id, basis);
          return {
            label: shortName(store, v.vendor_id),
            value: Math.round(sc.total_inr),
            note: sc.uncovered_lines.length ? `${sc.uncovered_lines.length} lines not priced` : undefined,
          };
        });
        const complete = bars.filter((b) => !b.note);
        const min = complete.length ? Math.min(...complete.map((b) => b.value)) : null;
        artifact = {
          type: "chart",
          title: "Total quoted by vendor",
          subtitle: `Priced lines only, INR (${BASIS_LABEL[basis].toLowerCase()})`,
          unit: "INR",
          bars: bars.map((b) => ({ ...b, highlight: min !== null && !b.note && b.value === min })),
        };
      }
      return {
        artifact,
        result: { shown_to_buyer: `Chart "${artifact.title}" with ${artifact.bars.length} bars`, data: artifact.bars },
      };
    }
    case "make_export": {
      const basis: Basis = input.basis ?? "headline";
      const rfxId = store.rfx_id;
      let artifact: ExportArtifact;
      if (input.kind === "award_scenario") {
        const sc = scenarioFromInput(store, { strategy: "cheapest_per_line", ...input });
        if ("error" in sc) return { result: sc };
        artifact = {
          type: "export",
          title: sc.label,
          filename: `${rfxId}_award_scenario`,
          sheets: [
            {
              name: "Allocation",
              rows: [
                ["Line", "Item", "Qty", "Awarded to", "Unit price (INR)", "Line total (INR)", "Needs review"],
                ...store.line_items.map((li) => {
                  const a = sc.allocations.find((x) => x.line_ref === li.no);
                  return a
                    ? [li.no, li.item, li.qty, vendorName(store, a.vendor_id), Math.round(a.unit_price_inr), Math.round(a.line_total_inr), sc.review_lines.includes(li.no) ? "Yes" : ""]
                    : [li.no, li.item, li.qty, "Not covered", null, null, ""];
                }),
                [null, "Total", null, null, null, Math.round(sc.total_inr), null],
              ],
            },
          ],
        };
      } else if (input.kind === "questionnaire") {
        const questions = store.rfx?.questionnaire ?? [];
        artifact = {
          type: "export",
          title: "Questionnaire responses",
          filename: `${rfxId}_questionnaire`,
          sheets: [
            {
              name: "Questionnaire",
              rows: [
                ["Vendor", "Qualification", ...questions.map((q) => q.question)],
                ...store.questionnaire_verdicts.map((v) => [
                  vendorName(store, v.vendor_id),
                  v.gate_result,
                  ...questions.map((q) => {
                    const a = v.answers.find((x) => x.question_id === q.id || x.question === q.question);
                    return a ? `${a.raw_answer} [${a.quality.replace(/_/g, " ").toLowerCase()}]` : "";
                  }),
                ]),
              ],
            },
          ],
        };
      } else {
        artifact = {
          type: "export",
          title: "Price comparison",
          filename: `${rfxId}_comparison`,
          sheets: [
            {
              name: "Comparison",
              rows: [
                ["Line", "Item", "Qty", "Unit", ...store.vendors.flatMap((v) => [`${shortName(store, v.vendor_id)} (INR)`, `${shortName(store, v.vendor_id)} flags`])],
                ...store.line_items.map((li) => [
                  li.no,
                  li.item,
                  li.qty,
                  li.uom,
                  ...store.vendors.flatMap((v) => {
                    const line = getLine(store, v.vendor_id, li.no);
                    const p = line ? (basis === "best_available" && line.alternate_basis ? line.alternate_basis.unit_price_inr : line.normalized_unit_price_inr) : null;
                    return [p === null ? null : Math.round(p), (line?.flags ?? []).filter((f) => f !== "OK").join(", ")];
                  }),
                ]),
              ],
            },
          ],
        };
      }
      return { artifact, result: { shown_to_buyer: `Download ready: "${artifact.title}" (Excel)` } };
    }
    default:
      return { result: executeToolCall(store, toolName, input) };
  }
}


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
