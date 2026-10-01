import { NextRequest, NextResponse } from "next/server";
import { ComparisonStore } from "@/lib/schema";
import { runAgentTurn, ChatMessage } from "@/lib/agent/run";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  // The comparison is built in the browser from the workspace and sent with
  // each question, so the server holds no state between requests.
  const body = await req.json();
  const store: ComparisonStore | null = body.store ?? null;
  if (!store || store.vendors.length === 0) {
    return NextResponse.json({ ok: false, error: "There are no processed responses to analyze yet." }, { status: 400 });
  }
  const history: ChatMessage[] = body.history ?? [];
  if (history.length === 0) {
    return NextResponse.json({ ok: false, error: "Empty history." }, { status: 400 });
  }

  try {
    const { reply, toolCalls, artifacts } = await runAgentTurn(store, history);
    return NextResponse.json({ ok: true, reply, toolCalls, artifacts });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message ?? String(err) }, { status: 500 });
  }
}
