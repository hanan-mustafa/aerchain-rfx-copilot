"use client";

import { RfxDefinition } from "./schema";

async function postForDownload(url: string, body: unknown, fallbackName: string) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const name = res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? fallbackName;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function downloadRfxPack(rfx: RfxDefinition) {
  return postForDownload("/api/rfx-pack", { rfx }, `${rfx.rfx_id}_RFx.xlsx`);
}

export type SheetRows = (string | number | null)[][];

export function downloadXlsx(filename: string, sheets: { name: string; rows: SheetRows }[]) {
  return postForDownload("/api/export", { filename, sheets }, `${filename}.xlsx`);
}

export function downloadCsv(filename: string, rows: SheetRows) {
  const esc = (v: string | number | null) => {
    const s = v === null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const blob = new Blob([rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${filename.replace(/[^\w.-]+/g, "_")}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
