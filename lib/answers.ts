// Answer checking. The correct answers always come from the test's answer key.
import { findEvidence, type EvidenceMatch } from "@/lib/evidence";
import { allNumbers, type Test } from "@/lib/test-schema";

// Her evidence for a TRUE/FALSE or YES/NO question: the words she highlighted in a paragraph,
// or "none" ("No evidence": her claim that it is NOT GIVEN).
export type EvidencePick = { paragraph: number; start: number; end: number } | "none";

// found: her highlight overlaps the real quote · wrong_sentence: she highlighted something else ·
// missed: she said "no evidence", but the passage answers it · right_none: NOT GIVEN and she said
// "no evidence" · not_given: NOT GIVEN, but she highlighted a sentence.
export type EvidenceStatus = "found" | "wrong_sentence" | "missed" | "right_none" | "not_given";

export type EvidenceCheck = {
  status: EvidenceStatus;
  proof: EvidenceMatch | null; // where the answer is; null for NOT GIVEN
  picked: string | null; // the words she highlighted; null for "no evidence"
};

export type GradedAnswer = {
  number: number;
  given: string;
  correct: string[]; // all accepted answers; the first is the main one
  isCorrect: boolean;
  repeatOf?: number; // a "choose TWO" letter she already used for this question
  evidence?: EvidenceCheck; // TRUE/FALSE and YES/NO questions she gave evidence for
};

export const evidenceIsRight = (status: EvidenceStatus) => status === "found" || status === "right_none";

// Case-, space- and punctuation-insensitive: "  Not  Given. " matches "not given".
export function normalizeAnswer(answer: string): string {
  return answer
    .trim()
    .replace(/^["'“‘(]+|["'”’).,;:!?]+$/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

// "Choose TWO letters" is written as mcq questions in one group with the same
// accepted answers, e.g. 21: ["A", "C"] and 22: ["A", "C"]. Returns those sets.
function chooseManySets(test: Test): number[][] {
  const sets: number[][] = [];
  for (const group of test.groups) {
    if (group.type !== "mcq") continue;
    const byKey = new Map<string, number[]>();
    for (const q of group.questions) {
      const raw = test.answers[String(q.n)];
      if (!Array.isArray(raw) || raw.length < 2) continue;
      const key = raw.map(normalizeAnswer).sort().join("|");
      byKey.set(key, [...(byKey.get(key) ?? []), q.n]);
    }
    for (const numbers of byKey.values()) if (numbers.length > 1) sets.push(numbers);
  }
  return sets;
}

// A blank answer counts as wrong.
export function gradeTest(test: Test, given: Record<string, string>): GradedAnswer[] {
  const results = new Map<number, GradedAnswer>(
    allNumbers(test).map((number) => {
      const raw = test.answers[String(number)];
      const correct = Array.isArray(raw) ? raw : [raw];
      const answer = (given[String(number)] ?? "").trim();
      const isCorrect =
        answer !== "" && correct.some((c) => normalizeAnswer(c) === normalizeAnswer(answer));
      return [number, { number, given: answer, correct, isCorrect }];
    }),
  );

  // In a "choose TWO" set each letter counts once, so A + A scores one point, not two.
  // A wrong question is then shown the letter that is still missing.
  for (const numbers of chooseManySets(test)) {
    const set = numbers.map((n) => results.get(n)!);
    const usedBy = new Map<string, number>();
    for (const r of set) {
      if (!r.isCorrect) continue;
      const letter = normalizeAnswer(r.given);
      const first = usedBy.get(letter);
      if (first === undefined) {
        usedBy.set(letter, r.number);
      } else {
        r.isCorrect = false;
        r.repeatOf = first;
      }
    }
    const missing = set[0].correct.filter((c) => !usedBy.has(normalizeAnswer(c)));
    for (const r of set) {
      if (!r.isCorrect && missing.length > 0) r.correct = [missing.shift()!];
    }
  }

  return [...results.values()].sort((a, b) => a.number - b.number);
}

// Compares her evidence with the quote in the test file. Questions without a quote in the file,
// or without evidence from her, are not checked.
export function checkEvidence(test: Test, picks: Record<string, EvidencePick>, results: GradedAnswer[]) {
  const paragraphs = test.passage.paragraphs;
  for (const group of test.groups) {
    if (group.type !== "tfng" && group.type !== "ynng") continue;
    for (const q of group.questions) {
      const pick = picks[String(q.n)];
      const result = results.find((r) => r.number === q.n);
      if (q.evidence === undefined || pick === undefined || !result) continue;

      let picked: string | null = null;
      if (pick !== "none") {
        const text = paragraphs[pick.paragraph]?.text;
        if (text === undefined || pick.start >= pick.end || pick.end > text.length) continue;
        picked = text.slice(pick.start, pick.end);
      }
      const proof = q.evidence === null ? null : findEvidence(paragraphs, q.evidence);
      let status: EvidenceStatus;
      if (proof === null) status = pick === "none" ? "right_none" : "not_given";
      else if (pick === "none") status = "missed";
      else {
        const overlaps = pick.paragraph === proof.paragraph && pick.start < proof.end && proof.start < pick.end;
        status = overlaps ? "found" : "wrong_sentence";
      }
      result.evidence = { status, proof, picked };
    }
  }
}
