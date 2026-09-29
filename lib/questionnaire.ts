import { z } from "zod";
import {
  QuestionnaireAnswer,
  QuestionnaireAnswerQuality,
  QuestionnaireGateResult,
  VendorQuestionnaireVerdict,
} from "./schema";
import { askForJSON } from "./claude";

/**
 * DESIGN PRINCIPLE: the LLM classifies each raw answer's quality (it's
 * genuinely a judgment call whether an answer is "vague" vs "evasive" vs
 * backed by proof) -- but the PASS/BORDERLINE/FAIL gate itself is a plain,
 * transparent rule over those classifications, not a second opaque model
 * verdict. When a buyer with real money on the line asks "why was this
 * vendor disqualified," the answer must be a rule they can read, not
 * "the model decided."
 */

const QUESTIONNAIRE_GATE_RULES = [
  "authorized OEM reseller",
  "ISO 9001",
  "RoHS",
  "Energy Star",
  "data-wipe",
  "asset disposal",
];

const ClassificationWire = z.object({
  classifications: z.array(
    z.object({
      question: z.string(),
      quality: z.enum(["ANSWERED_WITH_PROOF", "ANSWERED_VAGUE", "ANSWERED_EVASIVE", "UNANSWERED"]),
      notes: z.string().optional(),
    })
  ),
});

export async function classifyQuestionnaireAnswers(
  vendorId: string,
  rawAnswers: { question: string; raw_answer: string }[]
): Promise<QuestionnaireAnswer[]> {
  const system = `You classify procurement vendor questionnaire answers by quality. For each \
question/answer pair, decide:
- ANSWERED_WITH_PROOF: specific, verifiable detail (certificate numbers, named contactable \
references, concrete SLA figures, named cities/partners). Judge against what the question asks \
for: if the question asks for a certificate number or proof, a bare "yes" is not proof; if it only \
asks whether something is true (e.g. "RoHS / Energy Star compliance?"), a direct, unhedged, \
specific affirmative that covers the whole scope ("all supplied hardware is RoHS compliant and \
Energy Star rated where applicable") counts as ANSWERED_WITH_PROOF.
- ANSWERED_VAGUE: an answer was given but has no verifiable specifics, or claims the thing \
without the proof the question asked for (e.g. "Yes, ISO 9001 certified." with no certificate \
number; "we comply with standard practices"; "PAN India support"; "meets applicable regulations"). \
A plain claim that is merely unproven is VAGUE, not EVASIVE.
- ANSWERED_EVASIVE: deflects, defers to a later conversation, or is a verbal-only/unwritten claim \
presented as if it were documented (e.g. "mentioned verbally in the covering call", "we can \
discuss this once the order is confirmed"), or answers a different question than was asked.
- UNANSWERED: the question was skipped or explicitly marked not answered.

Output ONLY this JSON shape, nothing else:
{"classifications": [{"question": string, "quality": "ANSWERED_WITH_PROOF"|"ANSWERED_VAGUE"|"ANSWERED_EVASIVE"|"UNANSWERED", "notes": string}]}`;

  const user = `Vendor ID: ${vendorId}\n\nQuestions and answers:\n${rawAnswers
    .map((a, i) => `${i + 1}. Q: ${a.question}\n   A: ${a.raw_answer}`)
    .join("\n\n")}`;

  const jsonText = await askForJSON({ system, user, maxTokens: 4096 });
  const parsed = ClassificationWire.parse(JSON.parse(jsonText));

  return rawAnswers.map((a, i) => ({
    vendor_id: vendorId,
    question: a.question,
    raw_answer: a.raw_answer,
    quality: parsed.classifications[i]?.quality ?? ("UNANSWERED" as QuestionnaireAnswerQuality),
    notes: parsed.classifications[i]?.notes,
  }));
}

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
  answers: QuestionnaireAnswer[]
): VendorQuestionnaireVerdict {
  const criticalQuestions = answers.filter((a) =>
    QUESTIONNAIRE_GATE_RULES.some((kw) => a.question.toLowerCase().includes(kw.toLowerCase()))
  );

  const failing = criticalQuestions.filter(
    (a) => a.quality === "UNANSWERED" || a.quality === "ANSWERED_EVASIVE"
  );
  const vague = criticalQuestions.filter((a) => a.quality === "ANSWERED_VAGUE");

  let gate_result: QuestionnaireGateResult;
  const gate_reasons: string[] = [];

  if (failing.length > 0) {
    gate_result = "FAIL";
    gate_reasons.push(
      `Rule: FAIL if any compliance-critical question is unanswered or evasive. Triggered by: ${failing
        .map((f) => `"${f.question}" (${f.quality})`)
        .join("; ")}.`
    );
  } else if (vague.length > 0) {
    gate_result = "BORDERLINE";
    gate_reasons.push(
      `Rule: BORDERLINE if any compliance-critical question is answered without verifiable specifics. Triggered by: ${vague
        .map((v) => `"${v.question}"`)
        .join("; ")}.`
    );
  } else {
    gate_result = "PASS";
    gate_reasons.push(
      "Rule: PASS -- all compliance-critical questions (OEM authorization, ISO 9001, RoHS/Energy Star, data-wipe policy) answered with verifiable specifics."
    );
  }

  return { vendor_id: vendorId, answers, gate_result, gate_reasons };
}
