import { NextRequest, NextResponse } from "next/server";
import { runCopilotTurn, CopilotTurn } from "@/lib/copilot";
import { RfxDefinition } from "@/lib/schema";

export const maxDuration = 60;

// POST /api/copilot { draft, history } -> { message, draft }
export async function POST(req: NextRequest) {
  try {
    const { draft, history } = (await req.json()) as { draft: RfxDefinition; history: CopilotTurn[] };
    if (!draft || !history?.length) {
      return NextResponse.json({ ok: false, error: "A draft and a message are required." }, { status: 400 });
    }
    const result = await runCopilotTurn(draft, history);
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message ?? String(err) }, { status: 500 });
  }
}
