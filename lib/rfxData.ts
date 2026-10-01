import { LineItemSpec, VendorMeta } from "./schema";

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

export const QUESTIONNAIRE_FIELDS: string[] = [
  "Authorized OEM reseller? (name brands + attach proof)",
  "ISO 9001 certified? (certificate number)",
  "RoHS / Energy Star compliance on hardware supplied?",
  "Local service center cities and average onsite response SLA",
  "Standard warranty terms per product category",
  "Asset disposal / data-wipe policy for buyback of old devices",
  "Similar-scale deployment references (2+, with contact)",
  "Average lead time from PO to delivery",
];

export const VENDORS: VendorMeta[] = [
  {
    vendor_id: "apex",
    full_name: "Apex Business Systems Pvt. Ltd.",
    contact: "Rakesh Menon, rakesh.menon@apexbusiness.in",
    source_format: "xlsx",
    source_file: "Vendor_A_Apex_Business_Systems_Quote.xlsx",
    edge_case: "Clean control case: fills the buyer's template exactly, all 30 lines in INR.",
  },
  {
    vendor_id: "techmart",
    full_name: "TechMart Solutions",
    contact: "Priya Sharma, priya.sharma@techmartsol.com",
    source_format: "docx",
    source_file: "Vendor_B_TechMart_Solutions_Quote.docx",
    edge_case: "Own layout: items grouped by the vendor's categories, not the RFx line numbers; prices quoted GST-inclusive.",
  },
  {
    vendor_id: "global_it",
    full_name: "Global IT Distributors",
    contact: "Sanjay Bhatt, sanjay.bhatt@globalitdist.co.in",
    source_format: "pdf",
    source_file: "Vendor_C_Global_IT_Distributors_Quote.pdf",
    edge_case: "A 4% early-payment rebate that changes every price is disclosed only in a numbered note on a later page.",
  },
  {
    vendor_id: "quickserve",
    full_name: "QuickServe Traders",
    contact: "Manoj Iyer, quickservetraders@gmail.com",
    source_format: "email",
    source_file: "Vendor_D_QuickServe_Traders_Email.txt",
    edge_case: "Casual email: four laptop tiers collapsed into one 'average' price, six lines skipped.",
  },
  {
    vendor_id: "sunrise",
    full_name: "Sunrise Computech",
    contact: "Devendra Patil (phone only)",
    source_format: "image",
    source_file: "Vendor_E_Sunrise_Computech_RateCard.jpg",
    edge_case: "Phone photo of a tilted printed rate card: priced in USD, cable locks quoted per box of 10, four lines missing.",
  },
];

/**
 * Ground-truth questionnaire raw answers per vendor. In the real product
 * these arrive as part of each vendor's submission (a tab in the xlsx, a
 * section of the docx/pdf, or a reply paragraph) and would be extracted by
 * the same format-specific extractors as pricing. For this demo we source
 * them directly here since they were fabricated alongside the vendor files
 * and the extraction pipeline's job (LLM classification + rule gate) is
 * identical either way -- see lib/questionnaire.ts.
 */
export const QUESTIONNAIRE_RAW_ANSWERS: Record<string, Record<string, string>> = {
  apex: {
    [QUESTIONNAIRE_FIELDS[0]]: "Yes - Authorized Premier Partner for Dell, HP and Lenovo. Partner certificates attached as Annexure A.",
    [QUESTIONNAIRE_FIELDS[1]]: "Yes - ISO 9001:2015 certified. Certificate No. IN-QMS-4471, valid till Mar 2027.",
    [QUESTIONNAIRE_FIELDS[2]]: "Yes - all supplied hardware is RoHS compliant and Energy Star rated where applicable to the category.",
    [QUESTIONNAIRE_FIELDS[3]]: "12 service center cities. SLA: 4 business hours onsite response in metros, 8 hours in Tier-2 cities.",
    [QUESTIONNAIRE_FIELDS[4]]: "Laptops/Ultrabooks: 3-year onsite (OEM). Monitors: 3-year onsite. Peripherals: 1-year replacement. UPS: 2-year onsite.",
    [QUESTIONNAIRE_FIELDS[5]]: "NIST 800-88 compliant data sanitization; certificate of data destruction issued per device.",
    [QUESTIONNAIRE_FIELDS[6]]: "1) Meridian Financial Services - 450-seat refresh, Mar 2025, contact: it.procurement@meridianfs.in. 2) Coastal Logistics Group - 280-seat refresh, Aug 2024, contact: nikhil.rao@coastallogistics.in.",
    [QUESTIONNAIRE_FIELDS[7]]: "10 business days ex-stock for standard SKUs; 3-4 weeks for the 65-inch display panel.",
  },
  techmart: {
    [QUESTIONNAIRE_FIELDS[0]]: "We are an authorized reseller for HP and Lenovo. Dell items are sourced through our distribution partner, so we are not directly OEM-authorized for the Dell-equivalent SKUs quoted here.",
    [QUESTIONNAIRE_FIELDS[1]]: "Yes, ISO 9001 certified.",
    [QUESTIONNAIRE_FIELDS[2]]: "All our products meet applicable regulations.",
    [QUESTIONNAIRE_FIELDS[3]]: "Service desks in Bengaluru, Mumbai, Delhi, Pune, Chennai and Hyderabad. Standard response SLA is 24 hours.",
    [QUESTIONNAIRE_FIELDS[4]]: "Standard OEM warranty passed through - 1 year on laptops unless extension is separately purchased.",
    [QUESTIONNAIRE_FIELDS[5]]: "We wipe drives before disposal as a standard practice.",
    [QUESTIONNAIRE_FIELDS[6]]: "1) A mid-size fintech client (name confidential), 200-seat rollout, 2024. 2) A logistics company in Pune, approx. 150 seats, 2023.",
    [QUESTIONNAIRE_FIELDS[7]]: "3 to 4 weeks depending on the specific laptop model and current stock position.",
  },
  global_it: {
    [QUESTIONNAIRE_FIELDS[0]]: "We are a distributor with access to all leading brands.",
    [QUESTIONNAIRE_FIELDS[1]]: "(not answered)",
    [QUESTIONNAIRE_FIELDS[2]]: "(not answered)",
    [QUESTIONNAIRE_FIELDS[3]]: "PAN India support available.",
    [QUESTIONNAIRE_FIELDS[4]]: "As per manufacturer warranty card.",
    [QUESTIONNAIRE_FIELDS[5]]: "(not answered)",
    [QUESTIONNAIRE_FIELDS[6]]: "(not answered - available on request)",
    [QUESTIONNAIRE_FIELDS[7]]: "Subject to stock availability at the time of order.",
  },
  quickserve: {
    [QUESTIONNAIRE_FIELDS[0]]: "We comply with standard industry practices.",
    [QUESTIONNAIRE_FIELDS[1]]: "We comply with standard industry practices.",
    [QUESTIONNAIRE_FIELDS[2]]: "We comply with standard industry practices.",
    [QUESTIONNAIRE_FIELDS[3]]: "(not answered)",
    [QUESTIONNAIRE_FIELDS[4]]: "(not answered)",
    [QUESTIONNAIRE_FIELDS[5]]: "(not answered)",
    [QUESTIONNAIRE_FIELDS[6]]: "(not answered)",
    [QUESTIONNAIRE_FIELDS[7]]: "(not answered)",
  },
  sunrise: {
    [QUESTIONNAIRE_FIELDS[0]]: "Yes we are authorized dealers (mentioned verbally in the covering call, not in writing).",
    [QUESTIONNAIRE_FIELDS[1]]: "We are ISO certified.",
    [QUESTIONNAIRE_FIELDS[2]]: "All items are standard compliant.",
    [QUESTIONNAIRE_FIELDS[3]]: "Same day support in most cases.",
    [QUESTIONNAIRE_FIELDS[4]]: "Standard warranty applies.",
    [QUESTIONNAIRE_FIELDS[5]]: "We can discuss this separately once order is confirmed.",
    [QUESTIONNAIRE_FIELDS[6]]: "We supplied networking gear to a college in Nashik last year.",
    [QUESTIONNAIRE_FIELDS[7]]: "(not stated)",
  },
};
