"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { listVocab, type VocabItem } from "@/lib/db";

type Props = { tests: { id: string; title: string }[] };
type Sort = "newest" | "az";

// Uzbek o‘ / g‘ are written with many apostrophes (‘ ’ ʻ ʼ `); she types a plain '.
const normalize = (s: string) => s.toLowerCase().replace(/[‘’ʻʼ`]/g, "'");

const formatDate = (ms: number) =>
  new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

// The word list on /vocab: search, sort and filter by test. Reads IndexedDB only, no Gemini.
export default function VocabBank({ tests }: Props) {
  const [words, setWords] = useState<VocabItem[] | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [testId, setTestId] = useState("all");

  useEffect(() => {
    let active = true;
    listVocab().then((list) => {
      if (!active) return;
      setWords(list ?? []);
      setBlocked(list === null);
    });
    return () => {
      active = false;
    };
  }, []);

  const titles = useMemo(() => new Map(tests.map((t) => [t.id, t.title])), [tests]);

  // Only tests she has words from, in the same order as the home page.
  const testOptions = useMemo(() => {
    const used = new Set(words?.map((w) => w.testId));
    const known = tests.filter((t) => used.has(t.id));
    const unknown = [...used].filter((id) => !titles.has(id)).map((id) => ({ id, title: id }));
    return [...known, ...unknown];
  }, [words, tests, titles]);

  const shown = useMemo(() => {
    const q = normalize(query.trim());
    const list = (words ?? []).filter(
      (w) =>
        (testId === "all" || w.testId === testId) &&
        (!q ||
          [w.display, w.meaningEn, w.meaningUz, ...(w.synonyms ?? []), ...(w.antonyms ?? [])].some((s) =>
            normalize(s).includes(q),
          )),
    );
    return sort === "az" ? [...list].sort((a, b) => a.word.localeCompare(b.word)) : list;
  }, [words, query, sort, testId]);

  if (words === null) return <p className="mt-8 text-slate-500">Loading your words…</p>;

  if (blocked) {
    return (
      <p className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-slate-500">
        This browser is blocking saved data, so your words can&apos;t be shown.
      </p>
    );
  }

  if (words.length === 0) {
    return (
      <p className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-slate-500">
        No words yet. Solve a test, then explain a mistake or a sentence. New words are saved here.
      </p>
    );
  }

  return (
    <>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a word or meaning"
          aria-label="Search words"
          className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-[15px] text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          aria-label="Sort words"
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-[15px] text-slate-900"
        >
          <option value="newest">Newest first</option>
          <option value="az">A–Z</option>
        </select>
        <select
          value={testId}
          onChange={(e) => setTestId(e.target.value)}
          aria-label="Filter by test"
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-[15px] text-slate-900 sm:max-w-56"
        >
          <option value="all">All tests</option>
          {testOptions.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      </div>

      <p className="mt-4 text-sm text-slate-500">
        {shown.length === words.length
          ? `${words.length} ${words.length === 1 ? "word" : "words"}`
          : `Showing ${shown.length} of ${words.length} words`}
      </p>

      {shown.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-8 text-center text-slate-500">
          No words match.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {shown.map((w) => (
            <WordCard key={w.word} word={w} testTitle={titles.get(w.testId)} />
          ))}
        </ul>
      )}
    </>
  );
}

function WordCard({ word: w, testTitle }: { word: VocabItem; testTitle?: string }) {
  return (
    <li className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <p className="text-[17px] font-semibold text-slate-900">
        {w.display}
        {w.partOfSpeech && <span className="ml-2 text-sm font-normal italic text-slate-500">{w.partOfSpeech}</span>}
      </p>
      <p className="mt-1 text-[15px] text-slate-800">{w.meaningEn}</p>
      <p className="mt-0.5 text-sm text-slate-500">{w.meaningUz}</p>

      {w.example && <p className="mt-2 text-sm italic text-slate-600">&ldquo;{w.example}&rdquo;</p>}
      <WordChips label="Synonyms" words={w.synonyms} className="bg-emerald-50 text-emerald-800" />
      <WordChips label="Opposites" words={w.antonyms} className="bg-rose-50 text-rose-800" />

      <p className="mt-3 text-xs text-slate-500">
        From{" "}
        {testTitle ? (
          <Link href={`/test/${w.testId}`} className="font-semibold text-sky-700 hover:underline">
            {testTitle}
          </Link>
        ) : (
          <span className="font-semibold">{w.testId}</span>
        )}{" "}
        · Added {formatDate(w.addedAt)}
      </p>
    </li>
  );
}

function WordChips({ label, words, className }: { label: string; words?: string[]; className: string }) {
  if (!words?.length) return null;
  return (
    <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      {words.map((s) => (
        <span key={s} className={`rounded-full px-2.5 py-0.5 ${className}`}>
          {s}
        </span>
      ))}
    </p>
  );
}
