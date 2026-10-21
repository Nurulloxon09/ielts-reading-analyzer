"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { WordDetails } from "@/components/VocabBank";
import { getVocabWord, saveDefinedWord, vocabKey, type VocabItem } from "@/lib/db";
import type { VocabDefineResponse } from "@/lib/schema";

type Status =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "error"; error: string }
  | { state: "done"; item: VocabItem; note: string };

// "Add to vocabulary" on the results screen: she types a word from the passage and gets
// its meaning, synonyms and opposites. A word that is already saved never costs a Gemini call.
export default function AddToVocab({ testId }: { testId: string }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-sky-600 px-3 py-1.5 text-sm font-semibold text-sky-700 hover:bg-sky-50"
      >
        + Add to vocabulary
      </button>
      {open && <AddWordDialog testId={testId} onClose={close} />}
    </>
  );
}

function AddWordDialog({ testId, onClose }: { testId: string; onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [word, setWord] = useState("");
  const [status, setStatus] = useState<Status>({ state: "idle" });

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The input is disabled while loading; give focus back so she can fix the spelling.
  useEffect(() => {
    if (status.state === "error") inputRef.current?.focus();
  }, [status.state]);

  async function lookUp(e: FormEvent) {
    e.preventDefault();
    const typed = word.trim();
    if (typed.length < 2 || status.state === "loading") return;
    setStatus({ state: "loading" });

    const saved = await getVocabWord(typed);
    if (saved) {
      setStatus({ state: "done", item: saved, note: "Already in your vocabulary." });
      return;
    }

    let data: VocabDefineResponse;
    try {
      const res = await fetch("/api/vocab/define", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testId, word: typed }),
      });
      data = await res.json();
    } catch {
      data = { ok: false, error: "Could not reach the server." };
    }
    if (!data.ok) {
      setStatus({ state: "error", error: data.error });
      return;
    }

    const item = await saveDefinedWord({
      word: typed,
      testId,
      definition: data.definition,
      example: data.exampleFromPassage,
    });
    if (item) {
      setStatus({ state: "done", item, note: "Saved to your vocabulary." });
    } else {
      // IndexedDB is blocked: still show the meaning, but say it was not saved.
      const { definition: def } = data;
      setStatus({
        state: "done",
        item: {
          word: vocabKey(typed),
          display: def.display,
          meaningEn: def.meaningEn,
          meaningUz: def.meaningUz,
          testId,
          reviewCount: 0,
          addedAt: Date.now(),
          partOfSpeech: def.partOfSpeech,
          synonyms: def.synonyms,
          antonyms: def.antonyms,
          example: data.exampleFromPassage,
        },
        note: "This browser is blocking saved data, so the word was not saved.",
      });
    }
  }

  function addAnother() {
    setWord("");
    setStatus({ state: "idle" });
    inputRef.current?.focus();
  }

  const loading = status.state === "loading";

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-slate-900/30 p-4 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add to vocabulary"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-xl"
      >
        <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
          <h2 className="flex-1 text-lg font-bold text-slate-900">Add to vocabulary</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-md px-2 py-1 text-lg leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            ×
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto px-5 py-5">
          <form onSubmit={lookUp} className="flex flex-col gap-2">
            <label htmlFor="vocab-word" className="text-sm text-slate-600">
              Type a word or short phrase from the passage.
            </label>
            <div className="flex gap-2">
              <input
                id="vocab-word"
                ref={inputRef}
                value={word}
                onChange={(e) => setWord(e.target.value)}
                disabled={loading}
                maxLength={40}
                autoComplete="off"
                spellCheck={false}
                placeholder="e.g. decline"
                className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-[15px] text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:bg-slate-50"
              />
              <button
                type="submit"
                disabled={loading || word.trim().length < 2}
                className="shrink-0 rounded-md bg-sky-600 px-4 py-2 text-[15px] font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
              >
                {loading ? "Looking up…" : "Add"}
              </button>
            </div>
          </form>

          {status.state === "error" && (
            <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {status.error}
            </p>
          )}

          {status.state === "done" && (
            <>
              <p className="text-sm font-semibold text-emerald-700">{status.note}</p>
              <div className="rounded-xl border border-slate-200 px-4 py-3">
                <WordDetails word={status.item} />
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={addAnother}
                  className="rounded-md border border-sky-600 px-3 py-1.5 text-sm font-semibold text-sky-700 hover:bg-sky-50"
                >
                  Add another word
                </button>
                <Link href="/vocab" className="text-sm font-semibold text-sky-700 hover:underline">
                  Open vocabulary →
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
