import { applyQuestionnaireGate } from "../lib/questionnaire";
import { QuestionnaireAnswer } from "../lib/schema";

function check(label: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"} - ${label}`);
  if (!cond) process.exitCode = 1;
}

const Q = {
  oem: "Authorized OEM reseller? (name brands + attach proof)",
  iso: "ISO 9001 certified? (certificate number)",
  rohs: "RoHS / Energy Star compliance on hardware supplied?",
  wipe: "Asset disposal / data-wipe policy for buyback of old devices",
};

// Apex-shaped: everything answered with proof -> PASS
const apexAnswers: QuestionnaireAnswer[] = [
  { vendor_id: "apex", question: Q.oem, raw_answer: "Authorized Premier Partner, certs attached", quality: "ANSWERED_WITH_PROOF" },
  { vendor_id: "apex", question: Q.iso, raw_answer: "ISO 9001:2015, cert no. IN-QMS-4471", quality: "ANSWERED_WITH_PROOF" },
  { vendor_id: "apex", question: Q.rohs, raw_answer: "RoHS + Energy Star compliant", quality: "ANSWERED_WITH_PROOF" },
  { vendor_id: "apex", question: Q.wipe, raw_answer: "NIST 800-88 compliant, certificate issued", quality: "ANSWERED_WITH_PROOF" },
];
const apexVerdict = applyQuestionnaireGate("apex", apexAnswers);
check("Apex (all proof): gate = PASS", apexVerdict.gate_result === "PASS");

// TechMart-shaped: OEM answered but admits non-authorization for some SKUs
// (evasive-ish/qualified), ISO yes-with-proof-ish, RoHS vague -> BORDERLINE
const techmartAnswers: QuestionnaireAnswer[] = [
  { vendor_id: "techmart", question: Q.oem, raw_answer: "Authorized for HP/Lenovo only, not Dell-equivalent", quality: "ANSWERED_VAGUE" },
  { vendor_id: "techmart", question: Q.iso, raw_answer: "Yes, ISO 9001 certified.", quality: "ANSWERED_VAGUE" },
  { vendor_id: "techmart", question: Q.rohs, raw_answer: "All our products meet applicable regulations.", quality: "ANSWERED_VAGUE" },
  { vendor_id: "techmart", question: Q.wipe, raw_answer: "We wipe drives before disposal.", quality: "ANSWERED_VAGUE" },
];
const techmartVerdict = applyQuestionnaireGate("techmart", techmartAnswers);
check("TechMart (vague but answered): gate = BORDERLINE", techmartVerdict.gate_result === "BORDERLINE");

// Global IT-shaped: OEM vague, ISO/RoHS/wipe unanswered -> FAIL
const globalItAnswers: QuestionnaireAnswer[] = [
  { vendor_id: "global_it", question: Q.oem, raw_answer: "We are a distributor with access to all leading brands.", quality: "ANSWERED_VAGUE" },
  { vendor_id: "global_it", question: Q.iso, raw_answer: "(not answered)", quality: "UNANSWERED" },
  { vendor_id: "global_it", question: Q.rohs, raw_answer: "(not answered)", quality: "UNANSWERED" },
  { vendor_id: "global_it", question: Q.wipe, raw_answer: "(not answered)", quality: "UNANSWERED" },
];
const globalItVerdict = applyQuestionnaireGate("global_it", globalItAnswers);
check("Global IT (mostly unanswered): gate = FAIL", globalItVerdict.gate_result === "FAIL");
check("Global IT: gate_reasons cites the specific triggering questions", globalItVerdict.gate_reasons.join(" ").includes("ISO"));

// Sunrise-shaped: evasive verbal-only claims -> FAIL
const sunriseAnswers: QuestionnaireAnswer[] = [
  { vendor_id: "sunrise", question: Q.oem, raw_answer: "Mentioned verbally in the covering call, not in writing.", quality: "ANSWERED_EVASIVE" },
  { vendor_id: "sunrise", question: Q.iso, raw_answer: "We are ISO certified.", quality: "ANSWERED_VAGUE" },
  { vendor_id: "sunrise", question: Q.rohs, raw_answer: "All items are standard compliant.", quality: "ANSWERED_VAGUE" },
  { vendor_id: "sunrise", question: Q.wipe, raw_answer: "We can discuss this separately once order is confirmed.", quality: "ANSWERED_EVASIVE" },
];
const sunriseVerdict = applyQuestionnaireGate("sunrise", sunriseAnswers);
check("Sunrise (evasive on 2 critical Qs): gate = FAIL", sunriseVerdict.gate_result === "FAIL");

console.log("\nDone.");
