// Browser-only IndexedDB (Dexie): her attempts, explained mistakes, new words and
// cached sentence explanations. Every call is wrapped: if IndexedDB is missing or
// blocked, the app still works, it just doesn't remember.
import Dexie, { type EntityTable } from "dexie";
import type { GradedAnswer } from "@/lib/answers";
import type { Analysis, AnalyzeResponse, Explanation, VocabCheck, VocabDefinition } from "@/lib/schema";

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
  reviewCount: number; // times practised in "Use in a sentence"
  lastReviewedAt?: number;
  addedAt: number;
  // Only on words she added herself with "Add to vocabulary".
  partOfSpeech?: string;
  synonyms?: string[];
  antonyms?: string[];
  example?: string;
};

type CachedExplanation = { key: string; explanation: Explanation; createdAt: number };

// One checked sentence in "Use in a sentence". Also the cache: same word + same sentence = no new Gemini call.
export type VocabAttempt = {
  id: number;
  key: string; // word + sentence
  word: string;
  sentence: string;
  check: VocabCheck;
  createdAt: number;
};

// Mistake replay: one row per test question she got wrong and explained. It points to the
// newest mistake for that question (its analysis is shown again when she fails the replay).
export type Replay = {
  id: number;
  testId: string;
  questionNumber: number;
  mistakeId: number;
  trapType: Mistake["trapType"];
  dueAt: number;
  streak: number; // correct replays in a row
  lastResult: "right" | "wrong" | null; // null = not re-tried yet
  retiredAt: number | null; // set once it is mastered
};

const DAY = 24 * 60 * 60 * 1000;
export const REPLAY_DAYS = { first: 3, afterRight: 7, afterWrong: 2 } as const;
const MASTERED_STREAK = 2; // retire after the second correct replay

// A new (or repeated) mistake starts the schedule again: due 3 days after it was saved.
function freshReplay(m: Pick<Mistake, "id" | "testId" | "questionNumber" | "trapType" | "createdAt">) {
  return {
    testId: m.testId,
    questionNumber: m.questionNumber,
    mistakeId: m.id,
    trapType: m.trapType,
    dueAt: m.createdAt + REPLAY_DAYS.first * DAY,
    streak: 0,
    lastResult: null,
    retiredAt: null,
  } satisfies Omit<Replay, "id">;
}

class AnalyzerDb extends Dexie {
  sessions!: EntityTable<Session, "id">;
  mistakes!: EntityTable<Mistake, "id">;
  vocab!: EntityTable<VocabItem, "word">;
  explanations!: EntityTable<CachedExplanation, "key">;
  vocabAttempts!: EntityTable<VocabAttempt, "id">;
  replays!: EntityTable<Replay, "id">;

  constructor() {
    super("ielts-reading-analyzer");
    this.version(1).stores({
      sessions: "++id, testId, finishedAt",
      mistakes: "++id, sessionId, testId, trapType, createdAt, [sessionId+questionNumber]",
      vocab: "&word, mistakeId, testId, addedAt",
      explanations: "&key",
    });
    // v2: "Use in a sentence" attempts. Only the new table is listed; every v1 table
    // and its data is kept as it is, so no upgrade function is needed.
    this.version(2).stores({
      vocabAttempts: "++id, &key, word, createdAt",
    });
    // v3: mistake replay. All earlier tables and data are kept; the upgrade schedules a
    // replay for every mistake already saved (the newest one per test question).
    this.version(3)
      .stores({
        replays: "++id, &[testId+questionNumber], dueAt",
      })
      .upgrade(async (tx) => {
        const newest = new Map<string, Mistake>();
        await tx
          .table<Mistake, number>("mistakes")
          .orderBy("createdAt")
          .each((m) => newest.set(`${m.testId}#${m.questionNumber}`, m));
        await tx.table("replays").bulkAdd([...newest.values()].map(freshReplay));
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
    d.transaction("rw", d.mistakes, d.vocab, d.replays, async () => {
      const existing = await d.mistakes
        .where("[sessionId+questionNumber]")
        .equals([input.sessionId, input.graded.number])
        .first();
      if (existing) return existing.id;

      const mistake = {
        sessionId: input.sessionId,
        testId: input.testId,
        questionNumber: input.graded.number,
        given: input.graded.given,
        correct: input.graded.correct,
        trapType: input.analysis.trap.type,
        analysis: input.analysis,
        evidence: input.evidence,
        createdAt: Date.now(),
      };
      const mistakeId = await d.mistakes.add(mistake);
      await addWords(d, input.analysis.newVocab, input.testId, mistakeId);

      // Wrong again in a full test: the replay schedule for this question starts over.
      const replay = freshReplay({ ...mistake, id: mistakeId });
      const current = await d.replays.where("[testId+questionNumber]").equals([input.testId, input.graded.number]).first();
      if (current) await d.replays.update(current.id, replay);
      else await d.replays.add(replay);
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

// The vocab key: lowercase, single spaces.
export const vocabKey = (word: string) => word.trim().toLowerCase().replace(/\s+/g, " ");

// A saved word, found by its key or its dictionary form ("herbivores" finds "herbivore").
async function findWord(d: AnalyzerDb, word: string): Promise<VocabItem | undefined> {
  const key = vocabKey(word);
  return (await d.vocab.get(key)) ?? (await d.vocab.filter((v) => vocabKey(v.display) === key).first());
}

export function getVocabWord(word: string): Promise<VocabItem | null> {
  return safely(async (d) => (await findWord(d, word)) ?? null);
}

// A word she added with "Add to vocabulary", saved under what she typed. If the word or its
// dictionary form is already saved, the saved one is kept and returned.
export function saveDefinedWord(input: {
  word: string;
  testId: string;
  definition: VocabDefinition;
  example: string;
}): Promise<VocabItem | null> {
  const { definition: def } = input;
  return safely((d) =>
    d.transaction("rw", d.vocab, async () => {
      const existing = (await findWord(d, input.word)) ?? (await findWord(d, def.display));
      if (existing) return existing;
      const item: VocabItem = {
        word: vocabKey(input.word),
        display: def.display.trim() || input.word.trim(),
        meaningEn: def.meaningEn,
        meaningUz: def.meaningUz,
        testId: input.testId,
        reviewCount: 0,
        addedAt: Date.now(),
        partOfSpeech: def.partOfSpeech,
        synonyms: def.synonyms,
        antonyms: def.antonyms,
        example: input.example,
      };
      await d.vocab.add(item);
      return item;
    }),
  );
}

// "Use in a sentence": the least practised word first, then the one practised longest ago.
// Words in `seen` (already shown in this visit) are left out; null when none is left.
export function nextPracticeWord(seen: ReadonlySet<string>): Promise<VocabItem | null> {
  return safely(async (d) => {
    const pool = (await d.vocab.toArray()).filter((w) => !seen.has(w.word));
    pool.sort(
      (a, b) =>
        a.reviewCount - b.reviewCount || (a.lastReviewedAt ?? 0) - (b.lastReviewedAt ?? 0) || a.addedAt - b.addedAt,
    );
    return pool[0] ?? null;
  });
}

const attemptKey = (word: string, sentence: string) => `${vocabKey(word)}\n${sentence.trim().replace(/\s+/g, " ")}`;

export function getVocabAttempt(word: string, sentence: string): Promise<VocabCheck | null> {
  return safely(async (d) => (await d.vocabAttempts.where("key").equals(attemptKey(word, sentence)).first())?.check ?? null);
}

// Saves a newly checked sentence and counts one more review for the word.
export function savePractice(word: string, sentence: string, check: VocabCheck): Promise<void | null> {
  return safely((d) =>
    d.transaction("rw", d.vocab, d.vocabAttempts, async () => {
      const key = attemptKey(word, sentence);
      if (!(await d.vocabAttempts.where("key").equals(key).first())) {
        await d.vocabAttempts.add({ key, word: vocabKey(word), sentence: sentence.trim(), check, createdAt: Date.now() });
      }
      const item = await d.vocab.get(vocabKey(word));
      if (item) await d.vocab.update(item.word, { reviewCount: item.reviewCount + 1, lastReviewedAt: Date.now() });
    }),
  );
}

export type DueReplay = { replay: Replay; mistake: Mistake };

// Replays that are due now, oldest first, each with its saved mistake.
export function listDueReplays(): Promise<DueReplay[] | null> {
  return safely(async (d) => {
    const now = Date.now();
    const due = (await d.replays.where("dueAt").belowOrEqual(now).toArray()).filter((r) => r.retiredAt === null);
    const mistakes = await d.mistakes.bulkGet(due.map((r) => r.mistakeId));
    return due
      .map((replay, i) => ({ replay, mistake: mistakes[i] }))
      .filter((x): x is DueReplay => x.mistake !== undefined)
      .sort((a, b) => a.replay.dueAt - b.replay.dueAt);
  });
}

export type ReplayStats = {
  due: number;
  active: number; // not mastered yet
  nextDueAt: number | null; // the next one that is not due yet
  stillFailing: { trapType: Mistake["trapType"]; count: number }[]; // not mastered, by trap type
};

export function getReplayStats(): Promise<ReplayStats | null> {
  return safely(async (d) => {
    const now = Date.now();
    const active = (await d.replays.toArray()).filter((r) => r.retiredAt === null);
    const byTrap = new Map<Mistake["trapType"], number>();
    for (const r of active) byTrap.set(r.trapType, (byTrap.get(r.trapType) ?? 0) + 1);
    const later = active.filter((r) => r.dueAt > now).map((r) => r.dueAt);
    return {
      due: active.length - later.length,
      active: active.length,
      nextDueAt: later.length ? Math.min(...later) : null,
      stillFailing: [...byTrap].map(([trapType, count]) => ({ trapType, count })).sort((a, b) => b.count - a.count),
    };
  });
}

// Right: back in 7 days, mastered after the second right answer in a row.
// Wrong: back in 2 days and the streak starts again.
export function recordReplay(id: number, right: boolean): Promise<Replay | null> {
  return safely((d) =>
    d.transaction("rw", d.replays, async () => {
      const replay = await d.replays.get(id);
      if (!replay) return null;
      const now = Date.now();
      const streak = right ? replay.streak + 1 : 0;
      const changes: Partial<Replay> = {
        streak,
        lastResult: right ? "right" : "wrong",
        dueAt: now + (right ? REPLAY_DAYS.afterRight : REPLAY_DAYS.afterWrong) * DAY,
        retiredAt: right && streak >= MASTERED_STREAK ? now : null,
      };
      await d.replays.update(id, changes);
      return { ...replay, ...changes };
    }),
  );
}

// The test or question no longer exists, so it can never be replayed.
export function retireReplay(id: number): Promise<number | null> {
  return safely((d) => d.replays.update(id, { retiredAt: Date.now() }));
}

// Every saved word, newest first.
export function listVocab(): Promise<VocabItem[] | null> {
  return safely((d) => d.vocab.orderBy("addedAt").reverse().toArray());
}

export function getCounts(): Promise<{ mistakes: number; words: number } | null> {
  return safely(async (d) => ({ mistakes: await d.mistakes.count(), words: await d.vocab.count() }));
}
