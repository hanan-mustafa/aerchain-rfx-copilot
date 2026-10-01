import { ComparisonStore, NormalizedLine, ProcessedResponse, RfxDefinition, VendorMeta, VendorQuestionnaireVerdict } from "./schema";
import { normalizeLine, fillMissingLinesAsNotQuoted } from "./normalize";
import { applyQuestionnaireGate } from "./gate";

/**
 * Builds the comparison for an RFx from whatever responses have been
 * processed so far: normalization, NOT_QUOTED backfill and the
 * qualification gate. Pure code with no server dependencies -- the browser
 * calls this whenever a response arrives, so the comparison updates without
 * any API call. Vendors with no response yet are left out of the comparison.
 */
export function buildComparison(
  rfx: RfxDefinition,
  vendors: VendorMeta[],
  responses: Record<string, ProcessedResponse | undefined>
): ComparisonStore {
  const responded = vendors.filter((v) => responses[v.vendor_id]);
  const lineByRef = new Map(rfx.line_items.map((li) => [li.no, li]));
  const normalized: NormalizedLine[] = [];
  const verdicts: VendorQuestionnaireVerdict[] = [];
  const vendorTerms: ComparisonStore["vendor_terms"] = {};
  const vendorFiles: Record<string, string> = {};
  const sources: Record<string, "live" | "cache"> = {};

  for (const vendor of responded) {
    const response = responses[vendor.vendor_id]!;
    const lines = response.lines
      .filter((e) => e.line_ref !== null || !e.resolvable) // keep unresolved rows even without a clean line_ref
      .map((e) => {
        const spec = e.line_ref !== null ? lineByRef.get(e.line_ref) : undefined;
        // Placeholder spec for unmapped lines so they still surface for triage.
        const effectiveSpec = spec ?? { no: e.line_ref ?? -1, item: "Unmapped vendor line", spec: "", uom: "per unit", qty: 0 };
        return normalizeLine({ ...e, vendor_id: vendor.vendor_id }, effectiveSpec);
      });
    normalized.push(...fillMissingLinesAsNotQuoted(lines, vendor, rfx.line_items));
    verdicts.push(applyQuestionnaireGate(vendor.vendor_id, response.answers, rfx.questionnaire));
    vendorTerms[vendor.vendor_id] = response.terms;
    vendorFiles[vendor.vendor_id] = response.file_name;
    sources[vendor.vendor_id] = response.from_cache ? "cache" : "live";
  }

  return {
    rfx_id: rfx.rfx_id,
    rfx,
    line_items: rfx.line_items,
    vendors: responded,
    normalized_lines: normalized,
    questionnaire_verdicts: verdicts,
    vendor_terms: vendorTerms,
    vendor_files: vendorFiles,
    generated_at: new Date().toISOString(),
    extraction_sources: sources,
  };
}
