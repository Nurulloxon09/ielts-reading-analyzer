// Answer checking. The correct answers always come from the test's answer key.
import { allNumbers, type Test } from "@/lib/test-schema";

export type GradedAnswer = {
  number: number;
  given: string;
  correct: string[]; // all accepted answers; the first is the main one
  isCorrect: boolean;
};

// Case-, space- and punctuation-insensitive: "  Not  Given. " matches "not given".
export function normalizeAnswer(answer: string): string {
  return answer
    .trim()
    .replace(/^["'“‘(]+|["'”’).,;:!?]+$/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

// A blank answer counts as wrong.
export function gradeTest(test: Test, given: Record<string, string>): GradedAnswer[] {
  return allNumbers(test)
    .sort((a, b) => a - b)
    .map((number) => {
      const raw = test.answers[String(number)];
      const correct = Array.isArray(raw) ? raw : [raw];
      const answer = (given[String(number)] ?? "").trim();
      const isCorrect =
        answer !== "" && correct.some((c) => normalizeAnswer(c) === normalizeAnswer(answer));
      return { number, given: answer, correct, isCorrect };
    });
}
