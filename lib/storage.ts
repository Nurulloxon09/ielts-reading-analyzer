// Small localStorage helpers. Storage can be missing or blocked, so every call is wrapped.
import type { GradedAnswer } from "@/lib/answers";
import type { AnalyzeResponse } from "@/lib/schema";

export type AnalysisResult = Extract<AnalyzeResponse, { ok: true }>;

export type SavedAttempt = { answers: Record<string, string>; startedAt: number };

export type SavedResult = {
  results: GradedAnswer[];
  analyses: Record<number, AnalysisResult>;
  timeSpentMs: number;
  finishedAt: number;
};

const attemptKey = (testId: string) => `ielts:v1:attempt:${testId}`;
const resultKey = (testId: string) => `ielts:v1:result:${testId}`;

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the app still works, it just won't remember.
  }
}

function remove(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export const storage = {
  readAttempt: (id: string) => read<SavedAttempt>(attemptKey(id)),
  writeAttempt: (id: string, attempt: SavedAttempt) => write(attemptKey(id), attempt),
  clearAttempt: (id: string) => remove(attemptKey(id)),
  readResult: (id: string) => read<SavedResult>(resultKey(id)),
  writeResult: (id: string, result: SavedResult) => write(resultKey(id), result),
  clearResult: (id: string) => remove(resultKey(id)),
};
