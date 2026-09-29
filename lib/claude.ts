import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

export function claude(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Add it to .env.local (dev) or your Vercel project's Environment Variables (prod)."
      );
    }
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

// Centralized model choice so it's one line to change everywhere.
export const MODEL = {
  extraction: "claude-sonnet-4-5", // structured extraction, needs to follow a strict schema
  vision: "claude-sonnet-4-5", // same model handles vision; kept as a separate name so it's easy to change independently
  agent: "claude-sonnet-4-5", // analyst chat / tool-calling
} as const;

/**
 * Ask Claude for strict JSON matching a schema we describe in the prompt.
 * We do NOT trust the model to self-police valid JSON -- we strip code
 * fences defensively and let the caller's zod schema throw if it's wrong,
 * which surfaces as a visible extraction failure rather than a silent
 * bad value flowing into the comparison store.
 */
export async function askForJSON(params: {
  system: string;
  user: string | Anthropic.MessageParam["content"];
  maxTokens?: number;
}): Promise<string> {
  const res = await claude().messages.create({
    model: MODEL.extraction,
    max_tokens: params.maxTokens ?? 4096,
    system: params.system,
    messages: [{ role: "user", content: params.user as any }],
  });
  const textBlock = res.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text block for a JSON extraction call.");
  }
  return textBlock.text.replace(/```json|```/g, "").trim();
}
