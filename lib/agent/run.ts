import Anthropic from "@anthropic-ai/sdk";
import { claude, MODEL } from "../claude";
import { ComparisonStore } from "../schema";
import { Artifact, buildToolDefinitions, runTool } from "./tools";

const SYSTEM_PROMPT = `You are a procurement analyst assistant helping a buyer evaluate vendor \
quotes for an RFx (request for quotation). You have tools that read a structured, already-\
normalized comparison store -- you do NOT have the raw vendor documents, and you must not \
estimate, average, or invent any price, total, or vendor qualification status. Every number \
you state must come from a tool call.

When a line or vendor total has flags like NOT_QUOTED, UNRESOLVED_AMBIGUOUS, UNIT_MISMATCH, or \
CONDITIONAL_PRICING, surface that clearly to the buyer instead of glossing over it -- these flags \
exist because a human needs to make a judgment call, not because the system failed. Cite which \
vendor and line a number came from. If a tool result shows a missing/unresolved price where the \
buyer's question needs one, say so plainly rather than filling the gap yourself.

Use compute_award_scenario / compare_award_scenarios for any award total or split-award question \
-- never add up prices yourself. When the buyer asks for a chart or visual, call make_chart; when \
they ask to export or download, call make_export. The chart or download appears below your reply \
automatically, so refer to it briefly instead of repeating all of its numbers.

Write like a sharp procurement analyst briefing a colleague: lead with the answer, then the \
supporting numbers. Be concise. Use a markdown table when comparing several vendors or lines. \
Don't narrate your process ("Let me check...", "I'll now look up...") and don't mention tools, \
the data store, or how the system works -- just give the answer. When asked to recommend, give a \
clear recommendation and name any flag the buyer should double-check before acting on it. \
Use vendor names, not ids.`;

/**
 * Reference data from the comparison store (not from any raw document): the
 * RFx line list and the valid vendor ids. Without it the model had no way to
 * map "docking stations" to line 8 and probed line numbers one tool call at
 * a time.
 */
function buildReferenceBlock(store: ComparisonStore): string {
  const rfx = store.rfx
    ? `RFx: ${store.rfx.title} (${store.rfx.rfx_id}), issued by ${store.rfx.buyer_org}. Scope: ${store.rfx.scope}\n` +
      `Buyer's terms: ${store.rfx.terms.map((t) => `${t.label}: ${t.requirement}`).join("; ")}\n\n`
    : "";
  const vendors = store.vendors.map((v) => `- ${v.vendor_id}: ${v.full_name}`).join("\n");
  const lines = store.line_items
    .map((li) => `${li.no}. ${li.item} (${li.spec}) -- qty ${li.qty}, ${li.uom}`)
    .join("\n");
  return `${rfx}REFERENCE DATA (use these exact vendor_ids in tool calls):

Vendors:
${vendors}

RFx line items:
${lines}`;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function runAgentTurn(
  store: ComparisonStore,
  history: ChatMessage[]
): Promise<{ reply: string; toolCalls: { name: string; input: any; result: any }[]; artifacts: Artifact[] }> {
  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const toolCallLog: { name: string; input: any; result: any }[] = [];
  const artifacts: Artifact[] = [];
  const tools = buildToolDefinitions(store);

  // Tool-calling loop: keep going while the model wants to call tools,
  // capped to avoid a runaway loop in case of a malformed tool interaction.
  for (let iteration = 0; iteration < 8; iteration++) {
    const res = await claude().messages.create({
      model: MODEL.agent,
      max_tokens: 2048,
      system: `${SYSTEM_PROMPT}\n\n${buildReferenceBlock(store)}`,
      tools,
      messages,
    });

    const toolUseBlocks = res.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    if (toolUseBlocks.length === 0) {
      const textBlock = res.content.find((b) => b.type === "text");
      const reply = textBlock && textBlock.type === "text" ? textBlock.text : "";
      return { reply, toolCalls: toolCallLog, artifacts };
    }

    // Model wants to use tools: execute them all, append the assistant's
    // tool_use turn and our tool_result turn, then loop again.
    messages.push({ role: "assistant", content: res.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = toolUseBlocks.map((block) => {
      const { result, artifact } = runTool(store, block.name, block.input);
      if (artifact) artifacts.push(artifact);
      toolCallLog.push({ name: block.name, input: block.input, result });
      return {
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(result),
      };
    });

    messages.push({ role: "user", content: toolResults });
  }

  return {
    reply: "That question needs more steps than I can take in one go. Try asking about one part of it at a time.",
    toolCalls: toolCallLog,
    artifacts,
  };
}
