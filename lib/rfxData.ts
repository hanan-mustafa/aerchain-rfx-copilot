import { ExtractedTerm, LineItemSpec, QuestionnaireItem, RfxDefinition, RfxTerm, VendorMeta } from "./schema";

/**
 * The sample RFx that ships with the product: a FY27 IT hardware refresh sent
 * to five vendors, whose real (fabricated) replies live in
 * data/vendor-uploads/. New RFxs are drafted with the co-pilot and stored in
 * the browser workspace; this one is the built-in demo.
 */
export const RFX_ID = "PRC-ITHW-FY27-0142";

export const LINE_ITEMS: LineItemSpec[] = [
  { no: 1, item: "Business Laptop - Entry", spec: "i5, 8GB RAM, 256GB SSD", uom: "per unit", qty: 100 },
  { no: 2, item: "Business Laptop - Standard", spec: "i5, 16GB RAM, 512GB SSD", uom: "per unit", qty: 150 },
  { no: 3, item: "Business Laptop - Premium", spec: "i7, 16GB RAM, 512GB SSD", uom: "per unit", qty: 50 },
  { no: 4, item: "Executive Ultrabook", spec: "i7, 32GB RAM, 1TB SSD", uom: "per unit", qty: 20 },
  { no: 5, item: "Monitor 24-inch FHD", spec: "1920x1080, IPS", uom: "per unit", qty: 200 },
  { no: 6, item: "Monitor 27-inch QHD", spec: "2560x1440, IPS", uom: "per unit", qty: 80 },
  { no: 7, item: "Dual Monitor Arm/Stand", spec: "Desk-clamp, gas spring", uom: "per unit", qty: 100 },
  { no: 8, item: "USB-C Docking Station", spec: "Universal, dual 4K out", uom: "per unit", qty: 220 },
  { no: 9, item: "Wireless Keyboard+Mouse Combo", spec: "2.4GHz + BT", uom: "per unit", qty: 300 },
  { no: 10, item: "Wired Keyboard", spec: "USB, full-size", uom: "per unit", qty: 50 },
  { no: 11, item: "Wired Optical Mouse", spec: "USB", uom: "per unit", qty: 50 },
  { no: 12, item: "USB Webcam 1080p", spec: "1080p30, auto-focus", uom: "per unit", qty: 150 },
  { no: 13, item: "USB Webcam 4K", spec: "4K30, auto-focus", uom: "per unit", qty: 30 },
  { no: 14, item: "Wired Noise-Cancelling Headset", spec: "USB, mic ANC", uom: "per unit", qty: 200 },
  { no: 15, item: "Bluetooth Headset", spec: "BT 5.0, mic", uom: "per unit", qty: 100 },
  { no: 16, item: "Conference Speakerphone", spec: "360-degree mic, USB/BT", uom: "per unit", qty: 25 },
  { no: 17, item: "Conference PTZ Camera", spec: "1080p, 10x zoom", uom: "per unit", qty: 15 },
  { no: 18, item: "65-inch Interactive Display Panel", spec: "4K touch, Android OS", uom: "per unit", qty: 8 },
  { no: 19, item: "Laptop Sleeve 15.6-inch", spec: "Neoprene", uom: "per unit", qty: 300 },
  { no: 20, item: "Spare 65W USB-C Charger", spec: "GaN, universal", uom: "per unit", qty: 100 },
  { no: 21, item: "Portable SSD 1TB", spec: "USB 3.2, external", uom: "per unit", qty: 60 },
  { no: 22, item: "USB-C to HDMI Adapter", spec: "4K30 support", uom: "per unit", qty: 150 },
  { no: 23, item: "USB Hub 7-port", spec: "USB 3.0, powered", uom: "per unit", qty: 80 },
  { no: 24, item: "Laptop Cable Lock", spec: "Keyed, Kensington slot", uom: "per unit", qty: 300 },
  { no: 25, item: "External Blu-ray/DVD Drive", spec: "USB, slim", uom: "per unit", qty: 10 },
  { no: 26, item: "Handheld Barcode Scanner (USB)", spec: "1D/2D, wired", uom: "per unit", qty: 25 },
  { no: 27, item: "Desktop Label Printer", spec: "Thermal, USB", uom: "per unit", qty: 15 },
  { no: 28, item: "Network Switch, 24-port unmanaged", spec: "Gigabit", uom: "per unit", qty: 10 },
  { no: 29, item: "Desktop UPS 650VA", spec: "Line-interactive", uom: "per unit", qty: 40 },
  // The buyer's template (data/RFx_Template_ITHardware_FY27.xlsx) lists this
  // line as "lot, qty 1", but its own spec is per device, and every vendor
  // that quoted it priced it per device across the 320 laptops/ultrabooks on
  // lines 1-4 (e.g. Global IT: 3,300 x 320 = 1,056,000 line total). As "lot"
  // the line was not comparable across vendors, so it is defined here as
  // what was actually requested and quoted.
  { no: 30, item: "3-Year Onsite Warranty Extension", spec: "Per-device bundle, all laptops (lines 1-4)", uom: "per device", qty: 320 },
];

export const SAMPLE_QUESTIONNAIRE: QuestionnaireItem[] = [
  { id: "q_oem", question: "Authorized OEM reseller? (name brands + attach proof)", critical: true },
  { id: "q_iso", question: "ISO 9001 certified? (certificate number)", critical: true },
  { id: "q_rohs", question: "RoHS / Energy Star compliance on hardware supplied?", critical: true },
  { id: "q_service", question: "Local service center cities and average onsite response SLA", critical: false },
  { id: "q_warranty", question: "Standard warranty terms per product category", critical: false },
  { id: "q_disposal", question: "Asset disposal / data-wipe policy for buyback of old devices", critical: true },
  { id: "q_references", question: "Similar-scale deployment references (2+, with contact)", critical: false },
  { id: "q_lead_time", question: "Average lead time from PO to delivery", critical: false },
];

// Kept for scripts that predate RfxDefinition.
export const QUESTIONNAIRE_FIELDS: string[] = SAMPLE_QUESTIONNAIRE.map((q) => q.question);

export const SAMPLE_TERMS: RfxTerm[] = [
  { id: "t_currency", label: "Currency", requirement: "Quote in INR unless you cannot invoice in INR." },
  { id: "t_validity", label: "Quote validity", requirement: "At least 15 days from submission." },
  { id: "t_payment", label: "Payment terms", requirement: "State your payment terms." },
  { id: "t_freight", label: "Freight", requirement: "State FOB or delivered terms." },
  { id: "t_taxes", label: "GST / taxes", requirement: "State whether prices include GST." },
  { id: "t_docs", label: "Supporting documents", requirement: "Attach OEM authorization and compliance certificates." },
];

export const SAMPLE_RFX: RfxDefinition = {
  rfx_id: RFX_ID,
  title: "FY27 Workplace Hardware Refresh",
  buyer_org: "BuyerCo Procurement",
  scope:
    "Laptops, monitors, peripherals, conferencing equipment and accessories for the FY27 workplace refresh, including a 3-year onsite warranty extension on all laptops. Delivered to BuyerCo offices.",
  currency: "INR",
  line_items: LINE_ITEMS,
  questionnaire: SAMPLE_QUESTIONNAIRE,
  terms: SAMPLE_TERMS,
  response_due: "2026-09-25",
  created_at: "2026-09-10T09:00:00.000Z",
};

/**
 * Sample-data stand-ins for what extraction reads out of each response,
 * used to seed the extraction cache (scripts/seed-extraction-cache.ts) so the
 * demo runs without API calls. Commercial terms are transcribed from the
 * vendor files themselves; questionnaire answers are the dataset's
 * ground-truth answers (for Sunrise these come from the vendor's covering
 * call, not the photographed rate card).
 */

export const SAMPLE_QUESTIONNAIRE_ANSWERS: Record<string, Record<string, string>> = {
  apex: {
    q_oem: "Yes - Authorized Premier Partner for Dell, HP and Lenovo. Partner certificates attached as Annexure A.",
    q_iso: "Yes - ISO 9001:2015 certified. Certificate No. IN-QMS-4471, valid till Mar 2027.",
    q_rohs: "Yes - all supplied hardware is RoHS compliant and Energy Star rated where applicable to the category.",
    q_service: "12 service center cities. SLA: 4 business hours onsite response in metros, 8 hours in Tier-2 cities.",
    q_warranty: "Laptops/Ultrabooks: 3-year onsite (OEM). Monitors: 3-year onsite. Peripherals: 1-year replacement. UPS: 2-year onsite.",
    q_disposal: "NIST 800-88 compliant data sanitization; certificate of data destruction issued per device.",
    q_references: "1) Meridian Financial Services - 450-seat refresh, Mar 2025, contact: it.procurement@meridianfs.in. 2) Coastal Logistics Group - 280-seat refresh, Aug 2024, contact: nikhil.rao@coastallogistics.in.",
    q_lead_time: "10 business days ex-stock for standard SKUs; 3-4 weeks for the 65-inch display panel.",
  },
  techmart: {
    q_oem: "We are an authorized reseller for HP and Lenovo. Dell items are sourced through our distribution partner, so we are not directly OEM-authorized for the Dell-equivalent SKUs quoted here.",
    q_iso: "Yes, ISO 9001 certified.",
    q_rohs: "All our products meet applicable regulations.",
    q_service: "Service desks in Bengaluru, Mumbai, Delhi, Pune, Chennai and Hyderabad. Standard response SLA is 24 hours.",
    q_warranty: "Standard OEM warranty passed through - 1 year on laptops unless extension is separately purchased.",
    q_disposal: "We wipe drives before disposal as a standard practice.",
    q_references: "1) A mid-size fintech client (name confidential), 200-seat rollout, 2024. 2) A logistics company in Pune, approx. 150 seats, 2023.",
    q_lead_time: "3 to 4 weeks depending on the specific laptop model and current stock position.",
  },
  global_it: {
    q_oem: "We are a distributor with access to all leading brands.",
    q_iso: "(not answered)",
    q_rohs: "(not answered)",
    q_service: "PAN India support available.",
    q_warranty: "As per manufacturer warranty card.",
    q_disposal: "(not answered)",
    q_references: "(not answered - available on request)",
    q_lead_time: "Subject to stock availability at the time of order.",
  },
  quickserve: {
    q_oem: "We comply with standard industry practices.",
    q_iso: "We comply with standard industry practices.",
    q_rohs: "We comply with standard industry practices.",
    q_service: "(not answered)",
    q_warranty: "(not answered)",
    q_disposal: "(not answered)",
    q_references: "(not answered)",
    q_lead_time: "(not answered)",
  },
  sunrise: {
    q_oem: "Yes we are authorized dealers (mentioned verbally in the covering call, not in writing).",
    q_iso: "We are ISO certified.",
    q_rohs: "All items are standard compliant.",
    q_service: "Same day support in most cases.",
    q_warranty: "Standard warranty applies.",
    q_disposal: "We can discuss this separately once order is confirmed.",
    q_references: "We supplied networking gear to a college in Nashik last year.",
    q_lead_time: "(not stated)",
  },
};

export const SAMPLE_COMMERCIAL_TERMS: Record<string, ExtractedTerm[]> = {
  apex: [
    { key: "payment_terms", value: "50% advance, 50% on delivery", source_excerpt: "Payment Terms: 50% advance, 50% on delivery", source_location: "Commercial Terms!B2" },
    { key: "quote_validity", value: "30 days", source_excerpt: "Quote Validity: 30 days from quote date", source_location: "Commercial Terms!B3" },
    { key: "freight", value: "Delivered (DAP), freight included", source_excerpt: "Freight Terms: Delivered at Buyer's site (DAP), freight included", source_location: "Commercial Terms!B4" },
    { key: "taxes", value: "18% GST extra", source_excerpt: "GST / Tax Treatment: 18% GST extra, as applicable", source_location: "Commercial Terms!B5" },
    { key: "warranty", value: "Laptops & monitors 3-yr onsite; peripherals 1-yr", source_excerpt: "Laptops/Ultrabooks: 3-year onsite (OEM). Monitors: 3-year onsite. Peripherals: 1-year replacement. UPS: 2-year onsite.", source_location: "Questionnaire!C6" },
    { key: "lead_time", value: "10 business days (display panel 3-4 weeks)", source_excerpt: "10 business days ex-stock for standard SKUs; 3-4 weeks for the 65-inch display panel.", source_location: "Questionnaire!C9" },
  ],
  techmart: [
    { key: "payment_terms", value: "100% advance", source_excerpt: "Payment: 100% advance against Proforma Invoice", source_location: "Commercial Terms, paragraph 1" },
    { key: "quote_validity", value: "15 days", source_excerpt: "This quotation is valid for 15 days from the date of this letter", source_location: "Commercial Terms, paragraph 2" },
    { key: "freight", value: "Ex-warehouse Bengaluru, freight by buyer", source_excerpt: "Delivery terms are Ex-warehouse, Bengaluru - freight and insurance to be borne by buyer.", source_location: "Commercial Terms, paragraph 3" },
    { key: "taxes", value: "GST inclusive", source_excerpt: "All prices are in INR and are inclusive of GST unless otherwise noted.", source_location: "Our Quotation, introduction" },
    { key: "warranty", value: "1-yr OEM on laptops", source_excerpt: "Standard OEM warranty passed through - 1 year on laptops unless extension is separately purchased", source_location: "Vendor Questionnaire Responses" },
    { key: "lead_time", value: "3-4 weeks", source_excerpt: "3 to 4 weeks depending on the specific laptop model and current stock position.", source_location: "Vendor Questionnaire Responses" },
  ],
  global_it: [
    { key: "payment_terms", value: "Net 30 (4% rebate if paid in 7 days)", source_excerpt: "Payment Terms: Net 30 from invoice date. Note 7: A 4% early-payment rebate applies ... if full payment is received within 7 days of invoice date", source_location: "Page 3, Commercial Terms; Note 7" },
    { key: "quote_validity", value: "20 days", source_excerpt: "Quote Validity: 20 days", source_location: "Page 3, Commercial Terms" },
    { key: "freight", value: "FOB Noida warehouse", source_excerpt: "Freight: FOB Global IT warehouse, Noida", source_location: "Page 3, Commercial Terms" },
    { key: "taxes", value: "18% GST extra", source_excerpt: "Taxes: 18% GST extra", source_location: "Page 3, Commercial Terms" },
    { key: "warranty", value: "As per OEM warranty card", source_excerpt: "Warranty as per respective OEM warranty card.", source_location: "Page 3, Note 3" },
    { key: "lead_time", value: "Subject to stock", source_excerpt: "Subject to stock availability at the time of order.", source_location: "Page 3, Questionnaire" },
  ],
  quickserve: [
    { key: "payment_terms", value: "Advance preferred", source_excerpt: "Advance payment preferred, can discuss otherwise if PO value is large.", source_location: "email paragraph 7" },
    { key: "quote_validity", value: "No fixed validity", source_excerpt: "Validity - please confirm fast as prices keep changing, no fixed validity as such.", source_location: "email paragraph 7" },
    { key: "freight", value: "Freight extra at actuals", source_excerpt: "freight extra at actuals", source_location: "email paragraph 7" },
    { key: "taxes", value: "GST extra", source_excerpt: "All prices above are per unit, exclusive of GST", source_location: "email paragraph 7" },
  ],
  sunrise: [
    { key: "payment_terms", value: "50% advance, balance before dispatch", source_excerpt: "Terms: 50% advance, balance before dispatch.", source_location: "footer, below table" },
    { key: "quote_validity", value: "10 days", source_excerpt: "Validity: 10 days.", source_location: "footer, below table" },
    { key: "freight", value: "Ex-works, freight not included", source_excerpt: "Prices ex-works, freight not included.", source_location: "footer, below table" },
    { key: "taxes", value: "Taxes extra", source_excerpt: "Taxes extra as applicable.", source_location: "footer, below table" },
  ],
};


export const SAMPLE_VENDORS: VendorMeta[] = [
  {
    vendor_id: "apex",
    email: "rakesh.menon@apexbusiness.in",
    full_name: "Apex Business Systems Pvt. Ltd.",
    contact: "Rakesh Menon, rakesh.menon@apexbusiness.in",
    source_format: "xlsx",
    source_file: "Vendor_A_Apex_Business_Systems_Quote.xlsx",
    edge_case: "Clean control case: fills the buyer's template exactly, all 30 lines in INR.",
  },
  {
    vendor_id: "techmart",
    email: "priya.sharma@techmartsol.com",
    full_name: "TechMart Solutions",
    contact: "Priya Sharma, priya.sharma@techmartsol.com",
    source_format: "docx",
    source_file: "Vendor_B_TechMart_Solutions_Quote.docx",
    edge_case: "Own layout: items grouped by the vendor's categories, not the RFx line numbers; prices quoted GST-inclusive.",
  },
  {
    vendor_id: "global_it",
    email: "sanjay.bhatt@globalitdist.co.in",
    full_name: "Global IT Distributors",
    contact: "Sanjay Bhatt, sanjay.bhatt@globalitdist.co.in",
    source_format: "pdf",
    source_file: "Vendor_C_Global_IT_Distributors_Quote.pdf",
    edge_case: "A 4% early-payment rebate that changes every price is disclosed only in a numbered note on a later page.",
  },
  {
    vendor_id: "quickserve",
    email: "quickservetraders@gmail.com",
    full_name: "QuickServe Traders",
    contact: "Manoj Iyer, quickservetraders@gmail.com",
    source_format: "email",
    source_file: "Vendor_D_QuickServe_Traders_Email.txt",
    edge_case: "Casual email: four laptop tiers collapsed into one 'average' price, six lines skipped.",
  },
  {
    vendor_id: "sunrise",
    email: "sunrise.computech@example.com",
    full_name: "Sunrise Computech",
    contact: "Devendra Patil (phone only)",
    source_format: "image",
    source_file: "Vendor_E_Sunrise_Computech_RateCard.jpg",
    edge_case: "Phone photo of a tilted printed rate card: priced in USD, cable locks quoted per box of 10, four lines missing.",
  },
];

// Back-compat aliases for scripts and older modules.
export const VENDORS = SAMPLE_VENDORS;
export const QUESTIONNAIRE_RAW_ANSWERS = SAMPLE_QUESTIONNAIRE_ANSWERS;
