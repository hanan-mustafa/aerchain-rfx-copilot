import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

// POST /api/export { filename, sheets: [{ name, rows: (string|number|null)[][] }] }
// -> an .xlsx download. The rows are computed by the caller from the
// comparison data; this route only formats them.
export async function POST(req: NextRequest) {
  const { filename, sheets } = (await req.json()) as {
    filename: string;
    sheets: { name: string; rows: (string | number | null)[][] }[];
  };
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets ?? []) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
    ws["!cols"] = (sheet.rows[0] ?? []).map((_, i) => ({
      wch: Math.min(60, Math.max(10, ...sheet.rows.map((r) => String(r[i] ?? "").length + 2))),
    }));
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const safeName = (filename || "export").replace(/[^\w.-]+/g, "_");
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeName}.xlsx"`,
    },
  });
}
