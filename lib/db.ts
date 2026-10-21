// IndexedDB in the browser (Dexie): her finished tests, saved mistakes and words.
// Client-only. Every call goes through safely(), because IndexedDB can be blocked
// (private window, full disk) and the app must keep working without it.
import Dexie, { type EntityTable, type Table } from "dexie";
import type { Analysis, AnalyzeResponse } from "@/lib/schema";

export type TrapType = Analysis["trap"]["type"];

type EvidenceLocation = Extract<AnalyzeResponse, { ok: true }>["evidence"];

export type SessionRecord = {
  id: number;
  testId: string;
  title: string;
  finishedAt: number;
  correct: number;
  total: number;
  timeSpentMs: number;
};

export type MistakeRecord = {
  id: number;
  sessionId: number;
  testId: string;
  questionNumber: number;
  given: string;
  correct: string[]; // accepted answers from the key; the first is the main one
  trapType: TrapType;
  analysis: Analysis;
  evidence: EvidenceLocation; // verified location in the passage, or null
  createdAt: number;
};

export type VocabItem = {
  word: string; // lowercase key
  display: string; // as she should see it
  meaningEn: string;
  meaningUz: string;
  partOfSpeech?: string;
  synonyms?: string[];
  antonyms?: string[];
  example?: string; // sentence from the passage
  mistakeId?: number; // set when the word came from a mistake's analysis
  testId: string;
  reviewCount: number;
  addedAt: number;
};

class ReadingDb extends Dexie {
  sessions!: EntityTable<SessionRecord, "id">;
  mistakes!: EntityTable<MistakeRecord, "id">;
  vocab!: Table<VocabItem, string>;

  constructor() {
    super("ielts-reading");
    this.version(1).stores({
      sessions: "++id, testId, finishedAt",
      mistakes: "++id, sessionId, testId, trapType, createdAt",
      vocab: "word, testId, addedAt, reviewCount",
    });
  }
}

export const db = new ReadingDb();

// Runs a database call; on any storage error returns the fallback instead of throwing.
export async function safely<T>(work: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await work();
  } catch {
    return fallback;
  }
}

export const vocabKey = (word: string) => word.trim().toLowerCase();

// Saves one explained mistake and the new words from its analysis.
// Words she already has are left as they are (keeps her review progress).
export function saveMistake(mistake: Omit<MistakeRecord, "id">): Promise<number | null> {
  return safely(
    () =>
      db.transaction("rw", db.mistakes, db.vocab, async () => {
        const mistakeId = await db.mistakes.add(mistake);
        for (const v of mistake.analysis.newVocab) {
          const word = vocabKey(v.word);
          if (word === "" || (await db.vocab.get(word))) continue;
          await db.vocab.add({
            word,
            display: v.word.trim(),
            meaningEn: v.meaningEn,
            meaningUz: v.meaningUz,
            mistakeId,
            testId: mistake.testId,
            reviewCount: 0,
            addedAt: mistake.createdAt,
          });
        }
        return mistakeId;
      }),
    null,
  );
}
