"use client";

import { useParams } from "next/navigation";
import { useWorkspace } from "./workspace";

/** The workspace entry for the RFx in the current URL (/rfx/[id]/...). */
export function useRfxFromRoute() {
  const params = useParams<{ id: string }>();
  const ws = useWorkspace();
  const id = decodeURIComponent(params.id);
  return { id, entry: ws.get(id), ws };
}
