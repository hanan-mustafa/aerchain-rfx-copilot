import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { RfxDefinition } from "@/lib/schema";

// POST /api/rfx-pack { rfx } -> the RFx as an Excel response template
// (instructions, line items, questionnaire, commercial terms). Vendors may
// use it, but replies in any other format are accepted too.
export async function POST(req: NextRequest) {
  const { rfx } = (await req.json()) as { rfx: RfxDefinition };
  const wb = XLSX.utils.book_new();
  const sheet = (name: string, rows: (string | number | null)[][], widths: number[]) => {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = widths.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
  sheet(
    "Instructions",
    [
      [`${rfx.title} - Request for Quotation`],
      [`Issued by: ${rfx.buyer_org} | RFx ref: ${rfx.rfx_id}${rfx.response_due ? ` | Responses due: ${rfx.response_due}` : ""}`],
      [""],
      ["Scope"],
      [rfx.scope],
      [""],
      ["You can quote on the 'Line Items' tab, or reply in whatever format you already use (your own quote, PDF, email)."],
      ...rfx.terms.map((t) => [`${t.label}: ${t.requirement}`]),
    ],
    [110]
  );
  sheet(
    "Line Items",
    [
      ["Line No.", "Item", "Specification", "UoM", "Qty Required", "Unit Price", "Currency", "Line Total", "Remarks"],
      ...rfx.line_items.map((li) => [li.no, li.item, li.spec, li.uom, li.qty, null, rfx.currency, null, null]),
    ],
    [9, 34, 30, 12, 13, 12, 10, 12, 30]
  );
  sheet(
    "Questionnaire",
    [["#", "Question", "Your response"], ...rfx.questionnaire.map((q, i) => [i + 1, q.question, null])],
    [5, 70, 60]
  );
  sheet(
    "Commercial Terms",
    [
      ["Field", "Your response"],
      ["Payment terms", null],
      ["Quote validity", null],
      ["Freight (FOB / delivered)", null],
      ["GST / tax treatment", null],
      ["Warranty", null],
      ["Lead time", null],
    ],
    [30, 60]
  );
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${rfx.rfx_id}_RFx.xlsx"`,
    },
  });
}
