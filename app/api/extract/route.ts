import { NextResponse } from "next/server";
import { runFullPipeline } from "@/lib/pipeline";
import { saveStore } from "@/lib/store";

export const maxDuration = 120; // vision + multiple LLM calls across 5 vendors can take a while

export async function POST() {
  try {
    const { store, errors } = await runFullPipeline();
    await saveStore(store);
    return NextResponse.json({ ok: true, store, errors });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message ?? String(err) }, { status: 500 });
  }
}
