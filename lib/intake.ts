"use client";

import { RfxDefinition } from "./schema";
import type { ResponseRecord } from "./workspace";
import { putFile } from "./fileStore";

export const ACCEPTED_FILES = ".xlsx,.xls,.xlsm,.csv,.docx,.pdf,.txt,.eml,.md,.jpg,.jpeg,.png,.webp";
export const ACCEPTED_LABEL = "Excel, CSV, Word, PDF, email/text or a photo, up to 4 MB";

export const PROCESSING_MESSAGES = [
  "Uploading…",
  "Reading the document…",
  "Matching prices to line items…",
  "Checking units and currency…",
  "Reading questionnaire answers…",
  "Picking out commercial terms…",
  "Almost done…",
];

/**
 * Processes a vendor response file: the server reads it (one AI pass per
 * new document; identical files are answered from cache), and the original
 * is kept in this browser so the buyer can reopen it.
 */
export async function processUpload(params: {
  rfx: RfxDefinition;
  vendorId: string;
  file: File;
  via: ResponseRecord["received_via"];
  note?: string;
}): Promise<ResponseRecord> {
  const { rfx, vendorId, file, via, note } = params;
  const form = new FormData();
  form.append("file", file);
  form.append("rfx", JSON.stringify(rfx));
  form.append("vendor_id", vendorId);
  const res = await fetch("/api/responses/process", { method: "POST", body: form });
  const data = await res.json().catch(() => ({ ok: false, error: `Upload failed (${res.status})` }));
  if (!data.ok) throw new Error(friendlyProcessingError(data.error));
  const fileKey = `${rfx.rfx_id}/${vendorId}/${Date.now()}-${file.name}`;
  await putFile(fileKey, file).catch(() => undefined);
  return { ...data.response, received_via: via, file_key: fileKey, note };
}

export function friendlyProcessingError(error: string | undefined): string {
  if (!error) return "Couldn't process this file. Please try again.";
  if (/credit balance/i.test(error)) return "Document processing is unavailable: the AI account is out of credits.";
  if (/api key|authentication/i.test(error)) return "Document processing isn't configured for this workspace.";
  return error;
}
