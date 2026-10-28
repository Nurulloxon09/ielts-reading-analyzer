"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Passage, { type Highlight } from "@/components/Passage";
import {
  getParaphraseRecords,
  listFinished,
  listMistakes,
  saveParaphraseAttempt,
  type ParaphraseRecord,
} from "@/lib/db";
import type { ParaphrasePair } from "@/lib/schema";
import { selectionInParagraph, type PassageSelection } from "@/lib/selection";
import { storage } from "@/lib/storage";
import type { PublicTest } from "@/lib/test-schema";

type Pair = ParaphrasePair & { key: string };
type Check = { hit: boolean; hint: string };
type Loaded = { state: "loading" } | { state: "error"; error: string } | { state: "ready"; pairs: Pair[] };

const ROUND = 10;

const pairKey = (p: ParaphrasePair) => `${p.testId}\n${p.phrase.trim().toLowerCase()}\n${p.paragraph}:${p.start}-${p.end}`;

// Plain overlap with the stored passage words. Most of her selection must be inside them, and it
// must cover at least half of them (or 25 characters of a long sentence).
function checkSelection(sel: PassageSelection, pair: Pair): Check {
  const overlap =
    sel.paragraph === pair.paragraph ? Math.max(0, Math.min(sel.end, pair.end) - Math.max(sel.start, pair.start)) : 0;
  const inside = overlap / (sel.end - sel.start);
  const covered = overlap / (pair.end - pair.start);
  if (inside >= 0.6 && (covered >= 0.5 || overlap >= 25)) return { hit: true, hint: "Yes! These words mean the same." };
  if (overlap > 0 && inside < 0.6) return { hit: false, hint: "Close, but you selected too much. Pick only the matching words." };
  if (overlap > 0) return { hit: false, hint: "Close: you found part of it. The full match is highlighted." };
  return { hit: false, hint: "Not these words. The matching words are highlighted." };
}

// Her own mistakes first; then the pairs she misses most, then the ones she has tried least.
function order(pairs: Pair[], records: Map<string, ParaphraseRecord>): Pair[] {
  const rank = (p: Pair) => {
    const r = records.get(p.key) ?? { hits: 0, misses: 0, lastAt: 0 };
    return [p.from === "mistake" ? 0 : 1, r.hits - r.misses, r.hits + r.misses, r.lastAt];
  };
  return [...pairs].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
    return 0;
  });
}

async function loadPairs(): Promise<Loaded> {
  const [finished, mistakes, records] = await Promise.all([listFinished(), listMistakes(), getParaphraseRecords()]);
  const testIds = [...new Set([...(finished?.keys() ?? []), ...storage.listResultIds()])].slice(0, 200);
  const fromMistakes = (mistakes ?? [])
    .flatMap((m) =>
      m.analysis.synonyms.map((s) => ({
        testId: m.testId,
        questionPhrase: s.questionPhrase.trim(),
        passagePhrase: s.passagePhrase.trim(),
      })),
    )
    .filter((s) => s.questionPhrase && s.passagePhrase && s.questionPhrase.length <= 300 && s.passagePhrase.length <= 600)
    .slice(0, 1000);

  let data: { ok: true; pairs: ParaphrasePair[] } | { ok: false; error: string };
  try {
    const res = await fetch("/api/paraphrase/pairs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ testIds, mistakes: fromMistakes }),
    });
    data = await res.json();
  } catch {
    data = { ok: false, error: "Could not reach the server." };
  }
  if (!data.ok) return { state: "error", error: data.error };

  // The same pair can come from a mistake and from the test file: keep it once, as a mistake.
  const byKey = new Map<string, Pair>();
  for (const p of data.pairs) {
    const key = pairKey(p);
    const seen = byKey.get(key);
    if (!seen || (seen.from === "test" && p.from === "mistake")) byKey.set(key, { ...p, key });
  }
  return { state: "ready", pairs: order([...byKey.values()], records ?? new Map()) };
}

// Paraphrase spotting: she sees a phrase from a question and selects the passage words that mean
// the same. Checked by overlap with the stored words. No Gemini.
export default function ParaphraseDrill() {
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });
  const [index, setIndex] = useState(0);
  const [roundStart, setRoundStart] = useState(0);
  const [tests, setTests] = useState<Record<string, PublicTest | "missing">>({});
  const [selection, setSelection] = useState<PassageSelection | null>(null);
  const [result, setResult] = useState<Check | null>(null);
  const [tally, setTally] = useState({ hits: 0, tries: 0 });
  const rightPane = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    loadPairs().then((l) => {
      if (active) setLoaded(l);
    });
    return () => {
      active = false;
    };
  }, []);

  const pairs = loaded.state === "ready" ? loaded.pairs : [];
  const roundEnd = Math.min(roundStart + ROUND, pairs.length);
  const pair: Pair | undefined = index < roundEnd ? pairs[index] : undefined;
  const test = pair ? tests[pair.testId] : undefined;

  // The passage of the current pair (without the answer key), fetched once per test.
  useEffect(() => {
    if (!pair || tests[pair.testId]) return;
    let active = true;
    fetch(`/api/tests/${pair.testId}`)
      .then((res) => res.json())
      .then((data: { ok: boolean; test?: PublicTest }) => {
        if (active) setTests((prev) => ({ ...prev, [pair.testId]: data.ok && data.test ? data.test : "missing" }));
      })
      .catch(() => {
        if (active) setTests((prev) => ({ ...prev, [pair.testId]: "missing" }));
      });
    return () => {
      active = false;
    };
  }, [pair, tests]);

  function captureSelection() {
    if (result) return;
    const picked = selectionInParagraph(2);
    if (picked) setSelection(picked);
  }

  function check() {
    if (!pair || !selection) return;
    const checked = checkSelection(selection, pair);
    setResult(checked);
    setTally((t) => ({ hits: t.hits + (checked.hit ? 1 : 0), tries: t.tries + 1 }));
    window.getSelection()?.removeAllRanges();
    void saveParaphraseAttempt(pair.key, pair.testId, checked.hit);
  }

  function next() {
    setIndex((i) => i + 1);
    setSelection(null);
    setResult(null);
    window.getSelection()?.removeAllRanges();
    rightPane.current?.scrollTo({ top: 0 });
  }

  function nextRound() {
    const start = roundEnd >= pairs.length ? 0 : roundEnd;
    setRoundStart(start);
    setIndex(start);
    setTally({ hits: 0, tries: 0 });
  }

  const highlight: Highlight | null =
    result && pair ? { paragraph: pair.paragraph, start: pair.start, end: pair.end } : null;

  if (loaded.state !== "ready" || pairs.length === 0 || !pair) {
    return (
      <Shell tally={null}>
        <div className="mx-auto max-w-xl px-6 py-16 text-center">
          {loaded.state === "loading" ? (
            <p className="text-slate-500">Loading…</p>
          ) : loaded.state === "error" ? (
            <p role="alert" className="text-rose-700">
              {loaded.error}
            </p>
          ) : pairs.length === 0 ? (
            <>
              <h1 className="text-2xl font-bold text-slate-900">Nothing to practise yet</h1>
              <p className="mt-3 text-[15px] text-slate-600">
                Phrases come from the tests you have finished and from the mistakes you explained. Finish a test first.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-slate-900">Round finished</h1>
              <p className="mt-3 text-[15px] text-slate-600">
                You found <span className="font-semibold text-emerald-700">{tally.hits}</span> of {tally.tries}.
              </p>
              <button
                type="button"
                onClick={nextRound}
                className="mt-6 rounded-md bg-sky-600 px-5 py-2.5 text-[15px] font-semibold text-white shadow-sm hover:bg-sky-700"
              >
                Another round
              </button>
            </>
          )}
          <p className="mt-6">
            <Link href="/" className="text-sm font-semibold text-sky-700 hover:underline">
              ← All tests
            </Link>
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell tally={tally}>
      <main className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-2 md:overflow-hidden">
        <div
          className="border-slate-200 bg-white md:overflow-y-auto md:border-r"
          onPointerUp={captureSelection}
          onKeyUp={captureSelection}
        >
          {test && test !== "missing" ? (
            <Passage test={test} highlight={highlight} />
          ) : (
            <p className="p-8 text-slate-500">{test === "missing" ? "This test is no longer available." : "Loading passage…"}</p>
          )}
        </div>

        <div ref={rightPane} className="bg-slate-50 md:overflow-y-auto">
          <div className="mx-auto flex max-w-[40rem] flex-col gap-5 px-6 py-6 md:px-8">
            <p className="text-sm text-slate-600">
              {index - roundStart + 1} of {roundEnd - roundStart} ·{" "}
              {pair.from === "mistake" ? "From a mistake you explained in " : "From "}
              <span className="font-semibold text-slate-900">{pair.title}</span>
            </p>

            <section className="rounded-xl border border-slate-200 bg-white px-6 py-5">
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Find the words that mean</p>
              <p className="mt-2 text-xl font-semibold leading-snug text-slate-900">“{pair.phrase}”</p>
              <p className="mt-3 text-sm text-slate-600">
                Select the words in the passage that say the same thing in different words. Then press Check.
              </p>
            </section>

            {!result && (
              <div className="flex flex-wrap items-center gap-3">
                <p className="min-w-0 flex-1 text-[15px] text-slate-700">
                  {selection ? (
                    <>
                      You selected: <q className="italic">{selection.text}</q>
                    </>
                  ) : (
                    "Nothing selected yet."
                  )}
                </p>
                <button
                  type="button"
                  onClick={next}
                  className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  Skip
                </button>
                <button
                  type="button"
                  onClick={check}
                  disabled={!selection}
                  className="rounded-md bg-sky-600 px-5 py-2 text-[15px] font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-50"
                >
                  Check
                </button>
              </div>
            )}

            {result && (
              <section
                role="status"
                className={`rounded-xl border px-5 py-4 ${
                  result.hit ? "border-emerald-200 bg-emerald-50/60" : "border-rose-200 bg-rose-50/60"
                }`}
              >
                <p className={`text-[15px] font-bold ${result.hit ? "text-emerald-800" : "text-rose-800"}`}>
                  {result.hit ? "✓ Found it" : "✗ Not yet"}
                </p>
                <p className="mt-1 text-[15px] text-slate-800">{result.hint}</p>
                {selection && !result.hit && (
                  <p className="mt-2 text-sm text-slate-600">
                    You selected: <q className="italic">{selection.text}</q>
                  </p>
                )}
                <p className="mt-2 text-sm text-slate-600">
                  The passage says: <q className="italic text-slate-900">{pair.quote}</q>
                </p>
                <button
                  type="button"
                  onClick={next}
                  className="mt-4 rounded-md bg-sky-600 px-5 py-2 text-[15px] font-semibold text-white shadow-sm hover:bg-sky-700"
                >
                  {index + 1 < roundEnd ? "Next phrase" : "Finish round"}
                </button>
              </section>
            )}
          </div>
        </div>
      </main>
    </Shell>
  );
}

function Shell({ tally, children }: { tally: { hits: number; tries: number } | null; children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col bg-slate-100 text-slate-900">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-4">
        <Link href="/" className="shrink-0 rounded-md px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900">
          ← All tests
        </Link>
        <p className="min-w-0 flex-1 truncate text-[15px] font-semibold">Spot the paraphrase</p>
        {tally && tally.tries > 0 && (
          <p className="shrink-0 text-sm text-slate-600">
            <span className="font-semibold text-emerald-700">{tally.hits}</span> of {tally.tries} found
          </p>
        )}
      </header>
      {children}
    </div>
  );
}
