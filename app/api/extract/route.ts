import { NextRequest, NextResponse } from "next/server";
import { runFullPipeline } from "@/lib/pipeline";
import { saveStore } from "@/lib/store";

export const maxDuration = 120; // vision + multiple LLM calls across 5 vendors can take a while

// POST /api/extract          -> reuse stored extractions for unchanged files (no API cost)
// POST /api/extract?fresh=1  -> call Claude for every vendor and refresh the cache
export async function POST(req: NextRequest) {
  const fresh = req.nextUrl.searchParams.get("fresh") === "1";
  try {
    const { store, errors } = await runFullPipeline({ useCache: !fresh });
    await saveStore(store);
    return NextResponse.json({ ok: true, store, errors });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message ?? String(err) }, { status: 500 });
  }
}
