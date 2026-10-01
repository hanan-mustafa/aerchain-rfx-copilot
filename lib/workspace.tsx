"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ComparisonStore, ProcessedResponse, RfxDefinition, VendorMeta } from "./schema";
import { buildComparison } from "./comparison";
import type { AwardAllocation } from "./award";

/**
 * The buyer's workspace: every RFx with its vendors, invitations, received
 * responses and award decision. Held in the browser (localStorage) so the
 * app works on serverless hosting without a database; the server only does
 * stateless work (document extraction, analysis). Swapping this for a real
 * backend touches this module only.
 */

export interface Invitation {
  vendor_id: string;
  sent_at: string;
  to: string;
  subject: string;
  body: string;
}

export interface ResponseRecord extends ProcessedResponse {
  received_via: "sample" | "upload" | "vendor_portal";
  file_key?: string; // IndexedDB key for uploaded originals
  note?: string; // vendor's covering note (vendor portal)
}


export interface AwardDecision {
  scenario_id: string;
  scenario_label: string;
  eligibility: string;
  basis: "headline" | "best_available";
  total_inr: number;
  allocations: AwardAllocation[];
  uncovered_lines: number[];
  rationale: string;
  approved_by: string;
  approved_at: string;
}

export type RfxStatus = "draft" | "open" | "awarded";

export interface WorkspaceRfx {
  rfx: RfxDefinition;
  status: RfxStatus;
  vendors: VendorMeta[];
  invitations: Invitation[];
  responses: Record<string, ResponseRecord>;
  award?: AwardDecision;
  is_sample: boolean;
  updated_at: string;
}

interface WorkspaceState {
  rfxs: WorkspaceRfx[];
}

const STORAGE_KEY = "rfx-copilot.workspace.v1";

function load(): WorkspaceState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as WorkspaceState) : null;
  } catch {
    return null;
  }
}

function save(state: WorkspaceState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked: the session keeps working in memory.
  }
}

async function fetchSample(): Promise<WorkspaceRfx> {
  const res = await fetch("/api/sample");
  const data = await res.json();
  if (!data.ok) throw new Error(data.error);
  const rfx: RfxDefinition = data.rfx;
  const vendors: VendorMeta[] = data.vendors;
  const responses: Record<string, ResponseRecord> = {};
  for (const [id, r] of Object.entries(data.responses as Record<string, ProcessedResponse>)) {
    responses[id] = { ...r, received_via: "sample", processed_at: "2026-09-24T10:00:00.000Z" };
  }
  return {
    rfx,
    status: "open",
    vendors,
    invitations: vendors.map((v) => buildInvitation(rfx, v, "2026-09-11T09:00:00.000Z")),
    responses,
    is_sample: true,
    updated_at: new Date().toISOString(),
  };
}

export function replyUrl(rfxId: string, vendorId: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/respond/${encodeURIComponent(rfxId)}/${encodeURIComponent(vendorId)}`;
}

export function buildInvitation(rfx: RfxDefinition, vendor: VendorMeta, sentAt: string): Invitation {
  const firstName = vendor.contact.split(/[ ,]/)[0] || "there";
  return {
    vendor_id: vendor.vendor_id,
    sent_at: sentAt,
    to: vendor.email ?? "",
    subject: `Request for quotation: ${rfx.title} (${rfx.rfx_id})`,
    body: [
      `Hi ${firstName},`,
      ``,
      `${rfx.buyer_org} invites ${vendor.full_name} to quote for ${rfx.title}.`,
      ``,
      rfx.scope,
      ``,
      `The attached Excel template lists all ${rfx.line_items.length} line items, the supplier questionnaire and our commercial terms. Use it if it's convenient, or reply in whatever format you already use: your own quote, a PDF, or a reply to this email.`,
      ``,
      `Submit your response: ${replyUrl(rfx.rfx_id, vendor.vendor_id)}`,
      rfx.response_due ? `Responses are due by ${new Date(rfx.response_due).toDateString()}.` : ``,
      ``,
      `Thanks,`,
      `${rfx.buyer_org}`,
    ]
      .filter((l, i, arr) => !(l === "" && arr[i - 1] === ""))
      .join("\n"),
  };
}

interface WorkspaceApi {
  ready: boolean;
  error: string | null;
  rfxs: WorkspaceRfx[];
  get: (rfxId: string) => WorkspaceRfx | undefined;
  upsert: (entry: WorkspaceRfx) => void;
  update: (rfxId: string, fn: (entry: WorkspaceRfx) => WorkspaceRfx) => void;
  remove: (rfxId: string) => void;
  resetSample: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceApi | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WorkspaceState>({ rfxs: [] });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = load();
    if (stored && stored.rfxs.some((r) => r.is_sample)) {
      setState(stored);
      setReady(true);
      return;
    }
    fetchSample()
      .then((sample) => setState({ rfxs: [sample, ...(stored?.rfxs ?? [])] }))
      .catch((e) => setError(e.message))
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (ready) save(state);
  }, [state, ready]);

  // Another tab (e.g. the vendor reply page) changed the workspace: adopt its
  // version so this tab doesn't overwrite it on the next save.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try {
        setState(JSON.parse(e.newValue) as WorkspaceState);
      } catch {
        // ignore malformed writes
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = useCallback((rfxId: string, fn: (entry: WorkspaceRfx) => WorkspaceRfx) => {
    setState((s) => ({
      rfxs: s.rfxs.map((r) => (r.rfx.rfx_id === rfxId ? { ...fn(r), updated_at: new Date().toISOString() } : r)),
    }));
  }, []);

  const upsert = useCallback((entry: WorkspaceRfx) => {
    setState((s) => {
      const exists = s.rfxs.some((r) => r.rfx.rfx_id === entry.rfx.rfx_id);
      const stamped = { ...entry, updated_at: new Date().toISOString() };
      return { rfxs: exists ? s.rfxs.map((r) => (r.rfx.rfx_id === entry.rfx.rfx_id ? stamped : r)) : [stamped, ...s.rfxs] };
    });
  }, []);

  const remove = useCallback((rfxId: string) => {
    setState((s) => ({ rfxs: s.rfxs.filter((r) => r.rfx.rfx_id !== rfxId) }));
  }, []);

  const resetSample = useCallback(async () => {
    const sample = await fetchSample();
    setState((s) => ({ rfxs: [sample, ...s.rfxs.filter((r) => !r.is_sample)] }));
  }, []);

  const api = useMemo<WorkspaceApi>(
    () => ({
      ready,
      error,
      rfxs: state.rfxs,
      get: (id) => state.rfxs.find((r) => r.rfx.rfx_id === id),
      upsert,
      update,
      remove,
      resetSample,
    }),
    [ready, error, state, upsert, update, remove, resetSample]
  );

  return <WorkspaceContext.Provider value={api}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceApi {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return ctx;
}

/** The comparison for one RFx, rebuilt in the browser whenever its responses change. */
export function useComparison(entry: WorkspaceRfx | undefined): ComparisonStore | null {
  return useMemo(
    () => (entry && Object.keys(entry.responses).length > 0 ? buildComparison(entry.rfx, entry.vendors, entry.responses) : null),
    [entry]
  );
}
