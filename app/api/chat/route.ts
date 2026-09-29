import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { runAgentTurn, ChatMessage } from "@/lib/agent/run";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const store = await getStore();
  if (!store) {
    return NextResponse.json(
      { ok: false, error: "No comparison store yet. Run extraction first from the dashboard." },
      { status: 404 }
    );
  }

  const body = await req.json();
  const history: ChatMessage[] = body.history ?? [];
  if (history.length === 0) {
    return NextResponse.json({ ok: false, error: "Empty history." }, { status: 400 });
  }

  try {
    const { reply, toolCalls } = await runAgentTurn(store, history);
    return NextResponse.json({ ok: true, reply, toolCalls });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message ?? String(err) }, { status: 500 });
  }
}
