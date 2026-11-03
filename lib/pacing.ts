// Pacing: how long she spends on each question group, and soft hints while the clock runs.
// Shared by client code. No Gemini.
import type { QuestionGroup } from "@/lib/test-schema";

export type GroupType = QuestionGroup["type"];

// Saved with every attempt: time on one question group of the test.
export type GroupTime = { groupIndex: number; type: GroupType; ms: number; questions: number };

export const TARGET_MS_PER_QUESTION = 60_000; // about 1 minute per question

export const TYPE_LABELS: Record<GroupType, string> = {
  tfng: "TRUE / FALSE / NOT GIVEN",
  ynng: "YES / NO / NOT GIVEN",
  gap: "Fill in the blanks",
  mcq: "Multiple choice",
  matching: "Matching",
};

export type TypePace = { type: GroupType; ms: number; questions: number };

// Time and questions added up per question type, slowest (per question) first.
export function paceByType(times: GroupTime[]): TypePace[] {
  const byType = new Map<GroupType, TypePace>();
  for (const t of times) {
    const sum = byType.get(t.type) ?? { type: t.type, ms: 0, questions: 0 };
    sum.ms += t.ms;
    sum.questions += t.questions;
    byType.set(t.type, sum);
  }
  return [...byType.values()]
    .filter((p) => p.questions > 0)
    .sort((a, b) => b.ms / b.questions - a.ms / a.questions);
}

export type PaceStatus = "ok" | "slow" | "very_slow";

export function paceStatus(ms: number, questions: number): PaceStatus {
  const ratio = ms / (questions * TARGET_MS_PER_QUESTION);
  return ratio <= 1.15 ? "ok" : ratio <= 1.5 ? "slow" : "very_slow";
}

export const minutesPerQuestion = (ms: number, questions: number) => (ms / questions / 60_000).toFixed(1);

export type PaceHint = { id: string; tone: "good" | "behind" | "last"; text: string };

const HINT_SHOW_MS = 60_000;

// A soft checkpoint while she solves: shown for one minute at about a third and two thirds of the
// time, and 3 minutes before the end. It never stops her.
export function paceHint(minutes: number, elapsedMs: number, answered: number, total: number): PaceHint | null {
  const showing = (at: number) => elapsedMs >= at && elapsedMs < at + HINT_SHOW_MS;
  const points = [
    { id: "third", share: 1 / 3, name: "a third" },
    { id: "two-thirds", share: 2 / 3, name: "two thirds" },
  ];
  for (const p of points) {
    const atMinutes = Math.round(minutes * p.share);
    if (!showing(atMinutes * 60_000)) continue;
    const expected = Math.round(total * p.share);
    const onTrack = answered >= expected;
    return {
      id: p.id,
      tone: onTrack ? "good" : "behind",
      text:
        `${atMinutes} minutes gone: you should be about ${p.name} of the way through (${expected} of ${total} questions). ` +
        `You have answered ${answered}. ` +
        (onTrack ? "Good pace!" : "Speed up a little: skip a hard question and come back to it later."),
    };
  }
  if (minutes >= 10 && showing((minutes - 3) * 60_000)) {
    return { id: "last", tone: "last", text: "3 minutes left. Give an answer to every question: a guess can still be right." };
  }
  return null;
}
