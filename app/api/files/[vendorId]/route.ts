import fs from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import mammoth from "mammoth";
import pdf from "pdf-parse";
import { VENDORS } from "@/lib/rfxData";

export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
  email: "text/plain; charset=utf-8",
  image: "image/jpeg",
};
const PREVIEW_CHARS = 900;

/** A short, plain-text look at the raw file for the landing page -- no LLM involved. */
async function textPreview(format: string, buf: Buffer): Promise<string> {
  switch (format) {
    case "xlsx": {
      const wb = XLSX.read(buf, { type: "buffer" });
      const sheet = wb.Sheets["Line Items"] ?? wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
      return rows.map((r) => r.filter((c) => c !== null && c !== undefined && c !== "").join("  |  ")).join("\n");
    }
    case "docx":
      return (await mammoth.extractRawText({ buffer: buf })).value.replace(/\n{2,}/g, "\n");
    case "pdf":
      return (await pdf(buf)).text.trim();
    case "email":
      return buf.toString("utf-8");
    default:
      return "";
  }
}

// GET /api/files/apex            -> the original vendor file (opens inline where the browser can)
// GET /api/files/apex?preview=1  -> { preview: "first ~900 chars as text" }
export async function GET(req: NextRequest, { params }: { params: { vendorId: string } }) {
  // Only files named in VENDORS are served -- the id is never used as a path.
  const vendor = VENDORS.find((v) => v.vendor_id === params.vendorId);
  if (!vendor) return NextResponse.json({ ok: false, error: "Unknown vendor" }, { status: 404 });
  const buf = await fs.readFile(path.join(process.cwd(), "data", "vendor-uploads", vendor.source_file));

  if (req.nextUrl.searchParams.get("preview") === "1") {
    const text = await textPreview(vendor.source_format, buf);
    return NextResponse.json({ ok: true, preview: text.slice(0, PREVIEW_CHARS) });
  }

  const inline = ["pdf", "email", "image"].includes(vendor.source_format);
  return new NextResponse(buf, {
    headers: {
      "Content-Type": CONTENT_TYPES[vendor.source_format],
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${vendor.source_file}"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
