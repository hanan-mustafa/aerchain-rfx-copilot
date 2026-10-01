import { NextRequest, NextResponse } from "next/server";
import { processResponse } from "@/lib/pipeline";
import { RfxDefinition } from "@/lib/schema";

export const maxDuration = 120;
const MAX_BYTES = 4 * 1024 * 1024; // Vercel's request body limit is 4.5 MB

// POST /api/responses/process (multipart: file, rfx (JSON), vendor_id, fresh)
// -> the processed response. Documents already processed for the same RFx are
// served from the cache without an API call.
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const rfx = JSON.parse(String(form.get("rfx") ?? "null")) as RfxDefinition | null;
    const vendorId = String(form.get("vendor_id") ?? "");
    if (!(file instanceof File) || !rfx || !vendorId) {
      return NextResponse.json({ ok: false, error: "A file, the RFx and a vendor are required." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "Files up to 4 MB are supported." }, { status: 413 });
    }
    const response = await processResponse({
      rfx,
      vendorId,
      fileName: file.name,
      mediaType: file.type,
      buf: Buffer.from(await file.arrayBuffer()),
      useCache: form.get("fresh") !== "1",
    });
    return NextResponse.json({ ok: true, response });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message ?? String(err) }, { status: 500 });
  }
}
