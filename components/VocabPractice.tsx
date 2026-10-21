"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Bilingual } from "@/components/AnalysisCard";
import { WordDetails } from "@/components/VocabBank";
import { getVocabAttempt, nextPracticeWord, savePractice, type VocabItem } from "@/lib/db";
import type { VocabCheck, VocabCheckResponse } from "@/lib/schema";

type Status =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "error"; error: string }
  | { state: "done"; check: VocabCheck; sentence: string };

const sameText = (a: string, b: string) => a.trim().replace(/\s+/g, " ") === b.trim().replace(/\s+/g, " ");

// /vocab/practice: one saved word at a time, least practised first. She writes a sentence,
// Gemini (Flash-Lite first) checks it. Each checked sentence is cached in IndexedDB.
export default function VocabPractice() {
  const seen = useRef(new Set<string>()); // words shown in this visit
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [word, setWord] = useState<VocabItem | null | undefined>(undefined); // undefined = loading
  const [sentence, setSentence] = useState("");
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const [practised, setPractised] = useState(0);

  const loadNext = useCallback(async () => {
    let next = await nextPracticeWord(seen.current);
    if (!next) {
      // Every word had a turn: start a new round, but not with the word she just saw.
      const last = [...seen.current].pop();
      seen.current = new Set(last ? [last] : []);
      next = (await nextPracticeWord(seen.current)) ?? (await nextPracticeWord(new Set()));
    }
    if (next) seen.current.add(next.word);
    setWord(next);
    setSentence("");
    setStatus({ state: "idle" });
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    let active = true;
    nextPracticeWord(seen.current).then((next) => {
      if (!active) return;
      if (next) seen.current.add(next.word);
      setWord(next);
    });
    return () => {
      active = false;
    };
  }, []);

  async function check(e?: FormEvent) {
    e?.preventDefault();
    const typed = sentence.trim();
    if (!word || typed.length < 3 || status.state === "checking") return;
    setStatus({ state: "checking" });

    // Already checked once: show the saved result. It does not count as another review.
    const cached = await getVocabAttempt(word.word, typed);
    if (cached) {
      setStatus({ state: "done", check: cached, sentence: typed });
      return;
    }

    let data: VocabCheckResponse;
    try {
      const res = await fetch("/api/vocab/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word: word.display,
          partOfSpeech: word.partOfSpeech,
          meaningEn: word.meaningEn,
          sentence: typed,
        }),
      });
      data = await res.json();
    } catch {
      data = { ok: false, error: "Could not reach the server." };
    }
    if (!data.ok) {
      setStatus({ state: "error", error: data.error });
      return;
    }

    await savePractice(word.word, typed, data.check);
    setStatus({ state: "done", check: data.check, sentence: typed });
    setPractised((n) => n + 1);
  }

  function skip() {
    void loadNext();
  }

  if (word === undefined) return <p className="mt-8 text-slate-500">Loading…</p>;

  if (word === null) {
    return (
      <p className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-slate-500">
        No words to practise yet. Solve a test and save some words first.{" "}
        <Link href="/" className="font-semibold text-sky-700 hover:underline">
          Go to tests
        </Link>
      </p>
    );
  }

  const checking = status.state === "checking";
  const done = status.state === "done";
  const unchanged = status.state === "done" && sameText(sentence, status.sentence);

  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <WordDetails word={word} />
        <p className="mt-3 text-xs text-slate-500">
          {word.reviewCount === 0
            ? "First practice"
            : `Practised ${word.reviewCount} ${word.reviewCount === 1 ? "time" : "times"}`}
        </p>
      </div>

      <form onSubmit={check} className="flex flex-col gap-2">
        <label htmlFor="practice-sentence" className="text-sm font-semibold text-slate-700">
          Your sentence with &ldquo;{word.display}&rdquo;
        </label>
        <textarea
          id="practice-sentence"
          ref={inputRef}
          value={sentence}
          onChange={(e) => setSentence(e.target.value)}
          onKeyDown={(e) => {
            // Enter checks; Shift+Enter is a new line.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!unchanged) void check();
            }
          }}
          disabled={checking}
          rows={3}
          maxLength={300}
          autoFocus
          placeholder="Write one sentence about your own life or a topic you know."
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-[15px] leading-relaxed text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:bg-slate-50"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={checking || unchanged || sentence.trim().length < 3}
            className="rounded-md bg-sky-600 px-5 py-2 text-[15px] font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-60"
          >
            {checking ? "Checking…" : done ? "Check again" : "Check"}
          </button>
          {done ? (
            <button
              type="button"
              onClick={() => void loadNext()}
              className="rounded-md border border-sky-600 px-4 py-2 text-[15px] font-semibold text-sky-700 hover:bg-sky-50"
            >
              Next word →
            </button>
          ) : (
            <button
              type="button"
              onClick={skip}
              disabled={checking}
              className="px-2 py-2 text-sm font-medium text-slate-500 hover:text-slate-900 disabled:opacity-60"
            >
              Skip this word
            </button>
          )}
        </div>
      </form>

      {status.state === "error" && (
        <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {status.error}
        </p>
      )}

      {status.state === "done" && <Feedback check={status.check} sentence={status.sentence} />}

      {practised > 0 && (
        <p className="text-sm text-slate-500">
          Checked in this visit: <span className="font-semibold text-slate-900">{practised}</span>
        </p>
      )}
    </div>
  );
}

function Feedback({ check, sentence }: { check: VocabCheck; sentence: string }) {
  return (
    <section
      aria-live="polite"
      className={`flex flex-col gap-3 rounded-xl border px-5 py-4 ${
        check.correctUse ? "border-emerald-200 bg-emerald-50/60" : "border-rose-200 bg-rose-50/60"
      }`}
    >
      <p className={`text-[15px] font-bold ${check.correctUse ? "text-emerald-800" : "text-rose-800"}`}>
        {check.correctUse ? "✓ Well used" : "✗ Not quite"}
      </p>
      <Bilingual en={check.feedbackEn} uz={check.feedbackUz} />
      {!sameText(check.improvedSentence, sentence) && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Better version</p>
          <p className="rounded-md border-l-4 border-emerald-500 bg-white px-3 py-2 text-[15px] text-slate-900">
            {check.improvedSentence}
          </p>
        </div>
      )}
    </section>
  );
}
