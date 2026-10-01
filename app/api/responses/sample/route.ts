import { NextRequest, NextResponse } from "next/server";
import { processSampleResponse } from "@/lib/pipeline";

export const maxDuration = 120;

// POST /api/responses/sample { vendor_id, fresh } -> re-process one of the
// sample RFx's bundled files. fresh=true skips the cache (real API call).
export async function POST(req: NextRequest) {
  const { vendor_id, fresh } = await req.json();
  try {
    const response = await processSampleResponse(String(vendor_id), !fresh);
    return NextResponse.json({ ok: true, response });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message ?? String(err) }, { status: 500 });
  }
}
