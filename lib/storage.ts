// Small localStorage helpers. Storage can be missing or blocked, so every call is wrapped.
import type { GradedAnswer } from "@/lib/answers";
import type { GroupTime } from "@/lib/pacing";
import type { AnalyzeResponse } from "@/lib/schema";

export type AnalysisResult = Extract<AnalyzeResponse, { ok: true }>;

// Her evidence for a TRUE/FALSE question while she solves, with the highlighted words for display.
export type EvidenceNote = { paragraph: number; start: number; end: number; text: string } | "none";

export type SavedAttempt = {
  answers: Record<string, string>;
  startedAt: number;
  evidence?: Record<string, EvidenceNote>; // TRUE/FALSE and YES/NO questions only
};

export type SavedResult = {
  results: GradedAnswer[];
  analyses: Record<number, AnalysisResult>;
  timeSpentMs: number;
  finishedAt: number;
  sessionId?: number; // IndexedDB session row (lib/db.ts); missing if IndexedDB is unavailable
  groupTimes?: GroupTime[]; // missing on results saved before pacing was recorded
};

// Time per question group so far (lib/pacing.ts), kept across a refresh while she solves.
export type SavedPace = { ms: number[]; active: number | null };

const attemptKey = (testId: string) => `ielts:v1:attempt:${testId}`;
const resultKey = (testId: string) => `ielts:v1:result:${testId}`;
const paceKey = (testId: string) => `ielts:v1:pace:${testId}`;

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

// Test ids that have a saved result (the tests she has submitted on this device).
function listResultIds(): string[] {
  try {
    const prefix = resultKey("");
    return Object.keys(window.localStorage)
      .filter((k) => k.startsWith(prefix))
      .map((k) => k.slice(prefix.length));
  } catch {
    return [];
  }
}

export const storage = {
  readAttempt: (id: string) => read<SavedAttempt>(attemptKey(id)),
  writeAttempt: (id: string, attempt: SavedAttempt) => write(attemptKey(id), attempt),
  clearAttempt: (id: string) => remove(attemptKey(id)),
  readResult: (id: string) => read<SavedResult>(resultKey(id)),
  writeResult: (id: string, result: SavedResult) => write(resultKey(id), result),
  clearResult: (id: string) => remove(resultKey(id)),
  readPace: (id: string) => read<SavedPace>(paceKey(id)),
  writePace: (id: string, pace: SavedPace) => write(paceKey(id), pace),
  clearPace: (id: string) => remove(paceKey(id)),
  listResultIds,
};
