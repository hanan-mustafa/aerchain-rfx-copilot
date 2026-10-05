import type { WorkspaceRfx } from "./workspace";

export const STATUS_LABEL: Record<WorkspaceRfx["status"], string> = {
  draft: "Draft",
  open: "Collecting responses",
  awarded: "Awarded",
};

export const STATUS_BADGE: Record<WorkspaceRfx["status"], string> = {
  draft: "badge",
  open: "badge badge-accent badge-dot",
  awarded: "badge badge-ok badge-dot",
};

export function responseCounts(entry: WorkspaceRfx): { received: number; invited: number } {
  return { received: Object.keys(entry.responses).length, invited: entry.vendors.length };
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function formatInr(n: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (n === null || n === undefined) return "—";
  if (opts.compact) {
    if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
    if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  }
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

/** Asks before deleting an RFx; deletion can't be undone (except restoring the sample). */
export function confirmDeleteRfx(entry: WorkspaceRfx): boolean {
  const name = entry.rfx.title || "Untitled RFx";
  const restore = entry.is_sample ? " You can restore the sample RFx later from the sidebar." : " This can't be undone.";
  return window.confirm(`Delete "${name}"? Its vendors, responses, chat history and award decision will be removed.${restore}`);
}
