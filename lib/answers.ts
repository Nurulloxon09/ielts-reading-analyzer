// Answer comparison. The correct answer always comes from her answer key.

export type AnswerRow = {
  id: string;
  number: string;
  given: string;
  correct: string;
};

export type CheckedAnswer = {
  number: number;
  given: string;
  correct: string;
  isCorrect: boolean;
};

// Case- and space-insensitive: "  Not  Given " matches "not given".
export function normalizeAnswer(answer: string): string {
  return answer.trim().replace(/\s+/g, " ").toLowerCase();
}

// Rows without a correct answer are skipped. A blank answer counts as wrong.
export function checkAnswers(rows: AnswerRow[]): CheckedAnswer[] {
  return rows
    .filter((row) => row.correct.trim() !== "")
    .map((row) => ({
      number: Number(row.number),
      given: row.given.trim(),
      correct: row.correct.trim(),
      isCorrect:
        row.given.trim() !== "" &&
        normalizeAnswer(row.given) === normalizeAnswer(row.correct),
    }));
}
