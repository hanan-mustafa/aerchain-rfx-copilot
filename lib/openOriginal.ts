"use client";

import type { WorkspaceRfx } from "./workspace";
import { openStoredFile } from "./fileStore";

/** Opens the vendor's original response document, wherever it is stored. */
export function openOriginal(entry: WorkspaceRfx, vendorId: string) {
  const response = entry.responses[vendorId];
  if (!response) return;
  if (response.received_via === "sample") {
    window.open(`/api/files/${encodeURIComponent(vendorId)}`, "_blank", "noopener");
    return;
  }
  if (response.file_key) {
    openStoredFile(response.file_key).then((ok) => {
      if (!ok) window.alert("The original file isn't available in this browser. It was uploaded from another device or the browser data was cleared.");
    });
  }
}
