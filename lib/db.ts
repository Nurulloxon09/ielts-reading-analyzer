// Browser-only IndexedDB (Dexie): her attempts, explained mistakes, new words and
// cached sentence explanations. Every call is wrapped: if IndexedDB is missing or
// blocked, the app still works, it just doesn't remember.
import Dexie, { type EntityTable } from "dexie";
import type { GradedAnswer } from "@/lib/answers";
import type { Analysis, AnalyzeResponse, Explanation } from "@/lib/schema";

type Evidence = Extract<AnalyzeResponse, { ok: true }>["evidence"];

export type Session = {
  id: number;
  testId: string;
  title: string;
  finishedAt: number;
  correct: number;
  total: number;
  timeSpentMs: number;
};

export type Mistake = {
  id: number;
  sessionId: number;
  testId: string;
  questionNumber: number;
  given: string;
  correct: string[];
  trapType: Analysis["trap"]["type"];
  analysis: Analysis;
  evidence: Evidence;
  createdAt: number;
};

export type VocabItem = {
  word: string; // lowercase key
  display: string;
  meaningEn: string;
  meaningUz: string;
  mistakeId?: number; // missing for words from "Explain this sentence"
  testId: string;
  reviewCount: number;
  addedAt: number;
};

type CachedExplanation = { key: string; explanation: Explanation; createdAt: number };

class AnalyzerDb extends Dexie {
  sessions!: EntityTable<Session, "id">;
  mistakes!: EntityTable<Mistake, "id">;
  vocab!: EntityTable<VocabItem, "word">;
  explanations!: EntityTable<CachedExplanation, "key">;

  constructor() {
    super("ielts-reading-analyzer");
    this.version(1).stores({
      sessions: "++id, testId, finishedAt",
      mistakes: "++id, sessionId, testId, trapType, createdAt, [sessionId+questionNumber]",
      vocab: "&word, mistakeId, testId, addedAt",
      explanations: "&key",
    });
  }
}

let db: AnalyzerDb | null = null;

function getDb(): AnalyzerDb | null {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") return null;
  db ??= new AnalyzerDb();
  return db;
}

async function safely<T>(work: (db: AnalyzerDb) => Promise<T>): Promise<T | null> {
  const database = getDb();
  if (!database) return null;
  try {
    return await work(database);
  } catch (err) {
    console.warn("[db] IndexedDB error:", err);
    return null;
  }
}

// One row per submitted attempt. Returns the new session id.
export function saveSession(input: {
  testId: string;
  title: string;
  results: GradedAnswer[];
  timeSpentMs: number;
  finishedAt: number;
}): Promise<number | null> {
  return safely((d) =>
    d.sessions.add({
      testId: input.testId,
      title: input.title,
      finishedAt: input.finishedAt,
      correct: input.results.filter((r) => r.isCorrect).length,
      total: input.results.length,
      timeSpentMs: input.timeSpentMs,
    }),
  );
}

// Saves an explained mistake and its new words. Saving the same question twice is a no-op.
export function saveMistake(input: {
  sessionId: number;
  testId: string;
  graded: GradedAnswer;
  analysis: Analysis;
  evidence: Evidence;
}): Promise<number | null> {
  return safely((d) =>
    d.transaction("rw", d.mistakes, d.vocab, async () => {
      const existing = await d.mistakes
        .where("[sessionId+questionNumber]")
        .equals([input.sessionId, input.graded.number])
        .first();
      if (existing) return existing.id;

      const mistakeId = await d.mistakes.add({
        sessionId: input.sessionId,
        testId: input.testId,
        questionNumber: input.graded.number,
        given: input.graded.given,
        correct: input.graded.correct,
        trapType: input.analysis.trap.type,
        analysis: input.analysis,
        evidence: input.evidence,
        createdAt: Date.now(),
      });
      await addWords(d, input.analysis.newVocab, input.testId, mistakeId);
      return mistakeId;
    }),
  );
}

// New words are added once; an existing word keeps its review count.
async function addWords(
  d: AnalyzerDb,
  words: { word: string; meaningEn: string; meaningUz: string }[],
  testId: string,
  mistakeId?: number,
) {
  for (const w of words) {
    const key = w.word.trim().toLowerCase();
    if (!key || (await d.vocab.get(key))) continue;
    await d.vocab.add({
      word: key,
      display: w.word.trim(),
      meaningEn: w.meaningEn,
      meaningUz: w.meaningUz,
      mistakeId,
      testId,
      reviewCount: 0,
      addedAt: Date.now(),
    });
  }
}

const explanationKey = (testId: string, text: string) => `${testId}\n${text.trim()}`;

export function getCachedExplanation(testId: string, text: string): Promise<Explanation | null> {
  return safely(async (d) => (await d.explanations.get(explanationKey(testId, text)))?.explanation ?? null);
}

export function saveExplanation(testId: string, text: string, explanation: Explanation): Promise<void | null> {
  return safely((d) =>
    d.transaction("rw", d.explanations, d.vocab, async () => {
      await d.explanations.put({ key: explanationKey(testId, text), explanation, createdAt: Date.now() });
      await addWords(d, explanation.vocab, testId);
    }),
  );
}

export function getCounts(): Promise<{ mistakes: number; words: number } | null> {
  return safely(async (d) => ({ mistakes: await d.mistakes.count(), words: await d.vocab.count() }));
}
