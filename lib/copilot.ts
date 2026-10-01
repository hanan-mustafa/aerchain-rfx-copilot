import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { claude, MODEL } from "./claude";
import { RfxDefinition } from "./schema";

/**
 * The RFx co-pilot: turns a buyer's description into a structured RFx draft
 * (scope, line items, questionnaire, terms) and revises it turn by turn.
 * One Claude call per message, with a forced tool call so the reply is
 * always a complete, schema-valid draft plus a short note to the buyer.
 */

const DraftWire = z.object({
  message: z.string(),
  title: z.string(),
  scope: z.string(),
  response_due: z.string().nullable().optional(),
  line_items: z.array(z.object({ item: z.string(), spec: z.string(), uom: z.string(), qty: z.number() })),
  questionnaire: z.array(z.object({ question: z.string(), critical: z.boolean() })),
  terms: z.array(z.object({ label: z.string(), requirement: z.string() })),
});

const UPDATE_TOOL: Anthropic.Tool = {
  name: "update_rfx",
  description: "Return the complete, updated RFx draft and a short message to the buyer.",
  input_schema: {
    type: "object",
    properties: {
      message: {
        type: "string",
        description:
          "1-3 sentences to the buyer: what you drafted or changed, then at most two specific questions about details that matter for quoting (quantities, specs, delivery, dates). No preamble.",
      },
      title: { type: "string", description: "Short RFx title, e.g. 'Pune office furniture fit-out'." },
      scope: { type: "string", description: "2-3 sentence scope statement vendors will read." },
      response_due: { type: ["string", "null"], description: "YYYY-MM-DD if the buyer gave a deadline, else null." },
      line_items: {
        type: "array",
        description: "Every item to be quoted. Use the buyer's quantities; if unknown, use a sensible placeholder and ask.",
        items: {
          type: "object",
          properties: {
            item: { type: "string" },
            spec: { type: "string", description: "Key specifications a vendor needs to quote accurately." },
            uom: { type: "string", description: "Unit of measure, usually 'per unit'; 'lot' only for one-off services." },
            qty: { type: "number" },
          },
          required: ["item", "spec", "uom", "qty"],
        },
      },
      questionnaire: {
        type: "array",
        description:
          "5-8 supplier questions. Mark critical=true only for must-pass compliance items (authorizations, certifications, regulatory compliance, data security).",
        items: {
          type: "object",
          properties: { question: { type: "string" }, critical: { type: "boolean" } },
          required: ["question", "critical"],
        },
      },
      terms: {
        type: "array",
        description: "Commercial terms: currency, quote validity, payment, delivery/freight, GST, warranty, supporting documents.",
        items: {
          type: "object",
          properties: { label: { type: "string" }, requirement: { type: "string" } },
          required: ["label", "requirement"],
        },
      },
    },
    required: ["message", "title", "scope", "line_items", "questionnaire", "terms"],
  },
};

const SYSTEM = `You are an RFx co-pilot for a corporate procurement team in India. You turn the \\
buyer's description of what they need into a clear, quotable RFx, and revise it when they ask. \\
Prices are quoted in INR. Keep line items specific enough that two vendors would quote the same \\
thing; split clearly different variants into separate lines. Keep what the buyer already has unless \\
they ask to change it. Always respond by calling update_rfx with the full draft.`;

export interface CopilotTurn {
  role: "user" | "assistant";
  content: string;
}

export async function runCopilotTurn(
  draft: RfxDefinition,
  history: CopilotTurn[]
): Promise<{ message: string; draft: RfxDefinition }> {
  const current = {
    title: draft.title,
    scope: draft.scope,
    response_due: draft.response_due,
    line_items: draft.line_items.map(({ item, spec, uom, qty }) => ({ item, spec, uom, qty })),
    questionnaire: draft.questionnaire.map(({ question, critical }) => ({ question, critical })),
    terms: draft.terms.map(({ label, requirement }) => ({ label, requirement })),
  };
  const messages: Anthropic.MessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));
  // The current draft (which the buyer may have edited by hand) rides along
  // with the latest message, so manual edits are never lost.
  const last = messages[messages.length - 1];
  if (last?.role === "user") {
    last.content = `${last.content}\n\n<current_draft>\n${JSON.stringify(current)}\n</current_draft>`;
  }

  const res = await claude().messages.create({
    model: MODEL.copilot,
    max_tokens: 4096,
    system: SYSTEM,
    tools: [UPDATE_TOOL],
    tool_choice: { type: "tool", name: "update_rfx" },
    messages,
  });
  const block = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (!block) throw new Error("The co-pilot didn't return a draft. Please try again.");
  const out = DraftWire.parse(block.input);

  return {
    message: out.message,
    draft: {
      ...draft,
      title: out.title,
      scope: out.scope,
      response_due: out.response_due ?? draft.response_due,
      line_items: out.line_items.map((li, i) => ({ no: i + 1, ...li })),
      questionnaire: out.questionnaire.map((q, i) => ({ id: `q${i + 1}`, ...q })),
      terms: out.terms.map((t, i) => ({ id: `t${i + 1}`, ...t })),
    },
  };
}
