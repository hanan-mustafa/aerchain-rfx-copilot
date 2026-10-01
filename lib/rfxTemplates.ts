import { LineItemSpec, QuestionnaireItem, RfxDefinition, RfxTerm } from "./schema";
import { SAMPLE_RFX } from "./rfxData";

/** Starting points for a new RFx. Applied instantly, without an AI call. */
export interface RfxTemplate {
  id: string;
  name: string;
  description: string;
  build: () => Pick<RfxDefinition, "title" | "scope" | "line_items" | "questionnaire" | "terms">;
}

const STANDARD_TERMS: RfxTerm[] = [
  { id: "t1", label: "Currency", requirement: "Quote in INR." },
  { id: "t2", label: "Quote validity", requirement: "At least 30 days from submission." },
  { id: "t3", label: "Payment terms", requirement: "Net 30 preferred; state your terms." },
  { id: "t4", label: "Delivery", requirement: "Delivered to site, freight included; state lead time." },
  { id: "t5", label: "GST / taxes", requirement: "State whether prices include GST." },
];

const lines = (rows: [string, string, string, number][]): LineItemSpec[] =>
  rows.map(([item, spec, uom, qty], i) => ({ no: i + 1, item, spec, uom, qty }));
const questions = (rows: [string, boolean][]): QuestionnaireItem[] =>
  rows.map(([question, critical], i) => ({ id: `q${i + 1}`, question, critical }));

export const RFX_TEMPLATES: RfxTemplate[] = [
  {
    id: "it-hardware",
    name: "IT hardware refresh",
    description: "Laptops, monitors, peripherals and AV, 30 lines",
    build: () => ({
      title: "IT hardware refresh",
      scope: SAMPLE_RFX.scope,
      line_items: SAMPLE_RFX.line_items.map((l) => ({ ...l })),
      questionnaire: SAMPLE_RFX.questionnaire.map((q, i) => ({ ...q, id: `q${i + 1}` })),
      terms: SAMPLE_RFX.terms.map((t, i) => ({ ...t, id: `t${i + 1}` })),
    }),
  },
  {
    id: "office-furniture",
    name: "Office furniture fit-out",
    description: "Workstations, seating and storage, 8 lines",
    build: () => ({
      title: "Office furniture fit-out",
      scope: "Supply and installation of workstations, seating, meeting furniture and storage for a 120-seat office floor, including delivery, assembly and removal of packaging.",
      line_items: lines([
        ["Linear workstation", "1200 x 600 mm, laminate top, cable tray, modesty panel", "per seat", 120],
        ["Ergonomic task chair", "Mesh back, adjustable lumbar, 4D arms, BIFMA certified", "per unit", 120],
        ["Pedestal", "3-drawer mobile, central locking", "per unit", 120],
        ["Meeting table, 8-seater", "2400 x 1200 mm, cable management box", "per unit", 6],
        ["Meeting chair", "Upholstered, cantilever base", "per unit", 48],
        ["Manager cabin desk", "1800 x 900 mm with side return", "per unit", 8],
        ["Full-height storage", "2100 mm, swing doors, 4 shelves, lockable", "per unit", 20],
        ["Installation and assembly", "On-site installation, debris removal", "lot", 1],
      ]),
      questionnaire: questions([
        ["BIFMA or equivalent certification for seating? (attach certificate)", true],
        ["Fire-retardant materials compliance for upholstery and laminates?", true],
        ["Warranty terms per product category", false],
        ["Delivery and installation lead time from PO", false],
        ["Two references for similar-size fit-outs, with contacts", false],
      ]),
      terms: STANDARD_TERMS.map((t) => ({ ...t })),
    }),
  },
  {
    id: "blank",
    name: "Blank RFx",
    description: "Start from an empty draft",
    build: () => ({ title: "Untitled RFx", scope: "", line_items: [], questionnaire: [], terms: STANDARD_TERMS.map((t) => ({ ...t })) }),
  },
];

export function newRfxId(): string {
  const year = new Date().getFullYear();
  const n = Math.floor(1000 + Math.random() * 9000);
  return `RFX-${year}-${n}`;
}

export function emptyDraft(buyerOrg: string): RfxDefinition {
  return {
    rfx_id: newRfxId(),
    title: "Untitled RFx",
    buyer_org: buyerOrg,
    scope: "",
    currency: "INR",
    line_items: [],
    questionnaire: [],
    terms: STANDARD_TERMS.map((t) => ({ ...t })),
    response_due: null,
    created_at: new Date().toISOString(),
  };
}
