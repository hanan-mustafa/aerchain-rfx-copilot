import * as XLSX from "xlsx";
import { RfxDefinition } from "../schema";
import { askForJSON } from "../claude";
import { buildExtractionSystemPrompt, parseExtractionResponse, ExtractionResult } from "./shared";

/**
 * Deterministic parse comes first (never send a spreadsheet as an image --
 * we already have exact cell values, throwing that away for OCR/vision
 * would be strictly worse). We serialize every sheet to a cell-referenced
 * text dump (e.g. "Line Items!F14: 44520") so the LLM's source_location
 * output can point at a real, checkable cell.
 */
function workbookToReferencedText(buf: Buffer): string {
  const wb = XLSX.read(buf, { type: "buffer" });
  const chunks: string[] = [];
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const ref = sheet["!ref"];
    if (!ref) continue;
    chunks.push(`=== SHEET: ${sheetName} ===`);
    const range = XLSX.utils.decode_range(ref);
    for (let r = range.s.r; r <= range.e.r; r++) {
      const rowCells: string[] = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = sheet[addr];
        if (cell && cell.v !== undefined && cell.v !== "") {
          rowCells.push(`${addr}=${cell.v}`);
        }
      }
      if (rowCells.length > 0) {
        chunks.push(rowCells.join(" | "));
      }
    }
  }
  return chunks.join("\n");
}

export async function extractFromXlsx(
  buf: Buffer,
  vendorId: string,
  rfx: RfxDefinition
): Promise<ExtractionResult> {
  const referencedText = workbookToReferencedText(buf);
  const system = buildExtractionSystemPrompt(rfx);
  const user = `Here is the vendor's spreadsheet, serialized as "SheetName!CellRef=value" pairs \
(this IS the exact cell content -- use the cell refs verbatim as source_location, e.g. \
"Line Items!F14"):\n\n${referencedText}`;
  const jsonText = await askForJSON({ system, user, maxTokens: 8192 });
  return parseExtractionResponse(jsonText, vendorId);
}
