import { NextResponse } from "next/server";
import { SAMPLE_RFX, SAMPLE_VENDORS } from "@/lib/rfxData";
import { processSampleResponse } from "@/lib/pipeline";
import { ProcessedResponse } from "@/lib/schema";

export const dynamic = "force-dynamic";

// GET /api/sample -> the built-in sample RFx with its five processed vendor
// responses. Served from the committed extraction cache: no API calls.
export async function GET() {
  try {
    const responses: Record<string, ProcessedResponse> = {};
    for (const v of SAMPLE_VENDORS) responses[v.vendor_id] = await processSampleResponse(v.vendor_id, true);
    return NextResponse.json({ ok: true, rfx: SAMPLE_RFX, vendors: SAMPLE_VENDORS, responses });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message ?? String(err) }, { status: 500 });
  }
}
