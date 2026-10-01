import {
  QuestionnaireItem,
  QuestionnaireAnswer,
  QuestionnaireGateResult,
  VendorQuestionnaireVerdict,
} from "./schema";

/**
 * The qualification gate: a plain, stated rule over the per-answer quality
 * classifications (which are the only LLM judgment involved). Pure code with
 * no server dependencies, so the browser can re-run it.
 */

// Fallback for answers whose question isn't linked to a QuestionnaireItem:
// treat these topics as compliance-critical.
const QUESTIONNAIRE_GATE_RULES = [
  "authorized OEM reseller",
  "ISO 9001",
  "RoHS",
  "Energy Star",
  "data-wipe",
  "asset disposal",
];

/**
 * The transparent gate rule: FAIL if any compliance-critical question
 * (OEM authorization, ISO 9001, RoHS/Energy Star, or data-wipe policy) is
 * UNANSWERED or ANSWERED_EVASIVE. BORDERLINE if any is ANSWERED_VAGUE but
 * none FAIL outright. Otherwise PASS. This rule is intentionally simple
 * and stated in plain English so it can be shown to a buyer or vendor on
 * request -- see gate_reasons in the output.
 */
export function applyQuestionnaireGate(
  vendorId: string,
  answers: QuestionnaireAnswer[],
  questionnaire?: QuestionnaireItem[]
): VendorQuestionnaireVerdict {
  // Critical questions are the ones the buyer marked critical in the RFx;
  // answers not linked to an RFx question fall back to the keyword list.
  const isCritical = (a: QuestionnaireAnswer): boolean => {
    const item = questionnaire?.find((q) => q.id === a.question_id || q.question === a.question);
    if (item) return item.critical;
    return QUESTIONNAIRE_GATE_RULES.some((kw) => a.question.toLowerCase().includes(kw.toLowerCase()));
  };
  const criticalQuestions = answers.filter(isCritical);

  const failing = criticalQuestions.filter(
    (a) => a.quality === "UNANSWERED" || a.quality === "ANSWERED_EVASIVE"
  );
  const vague = criticalQuestions.filter((a) => a.quality === "ANSWERED_VAGUE");

  let gate_result: QuestionnaireGateResult;
  const gate_reasons: string[] = [];

  if (failing.length > 0) {
    gate_result = "FAIL";
    gate_reasons.push(
      `Not qualified: a required question was unanswered or evasive. ${failing
        .map((f) => `"${f.question}" (${f.quality === "UNANSWERED" ? "no answer" : "evasive"})`)
        .join("; ")}.`
    );
  } else if (vague.length > 0) {
    gate_result = "BORDERLINE";
    gate_reasons.push(
      `Borderline: a required question was answered without verifiable detail. ${vague
        .map((v) => `"${v.question}"`)
        .join("; ")}.`
    );
  } else {
    gate_result = "PASS";
    gate_reasons.push(
      criticalQuestions.length > 0
        ? `Qualified: every required question was answered with verifiable detail (${criticalQuestions.map((c) => `"${c.question}"`).join("; ")}).`
        : "Qualified: this RFx has no required questions."
    );
  }

  return { vendor_id: vendorId, answers, gate_result, gate_reasons };
}
