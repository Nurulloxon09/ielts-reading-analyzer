"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Bilingual from "@/components/Bilingual";
import { db, safely, type VocabItem } from "@/lib/db";

type TestRef = { id: string; title: string };
type Sort = "newest" | "az";

const formatDate = (ms: number) =>
  new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

// Search looks at the word, both meanings and the synonyms/antonyms.
function matches(item: VocabItem, query: string): boolean {
  if (query === "") return true;
  return [item.display, item.meaningEn, item.meaningUz, ...(item.synonyms ?? []), ...(item.antonyms ?? [])].some(
    (text) => text.toLowerCase().includes(query),
  );
}

// Every saved word, with search, sort and a test filter. Reads IndexedDB only; no Gemini.
export default function VocabBank({ tests }: { tests: TestRef[] }) {
  const [items, setItems] = useState<VocabItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [testId, setTestId] = useState("");

  useEffect(() => {
    let active = true;
    void safely(() => db.vocab.toArray(), null).then((rows) => {
      if (!active) return;
      if (rows) setItems(rows);
      else setFailed(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const titles = useMemo(() => new Map(tests.map((t) => [t.id, t.title])), [tests]);

  // Only tests she has words from, A–Z.
  const testOptions = useMemo(
    () =>
      [...new Set((items ?? []).map((i) => i.testId))]
        .map((id) => ({ id, title: titles.get(id) ?? id }))
        .sort((a, b) => a.title.localeCompare(b.title)),
    [items, titles],
  );

  if (failed) {
    return (
      <Notice>
        Your saved words can&apos;t be opened in this browser. Storage may be blocked (for example in a private
        window).
      </Notice>
    );
  }
  if (!items) return <p className="mt-8 text-slate-500">Loading your words…</p>;
  if (items.length === 0) {
    return <Notice>No words yet. When you explain your mistakes after a test, new words are saved here.</Notice>;
  }

  const q = query.trim().toLowerCase();
  const shown = items
    .filter((i) => (testId === "" || i.testId === testId) && matches(i, q))
    .sort(
      sort === "newest"
        ? (a, b) => b.addedAt - a.addedAt
        : (a, b) => a.display.localeCompare(b.display, "en", { sensitivity: "base" }),
    );

  const field =
    "h-10 rounded-md border border-slate-300 bg-white px-3 text-[15px] text-slate-900 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-200";

  return (
    <div className="mt-8 flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search words or meanings"
          aria-label="Search words or meanings"
          className={`${field} min-w-0 flex-1 basis-56`}
        />
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort" className={field}>
          <option value="newest">Newest first</option>
          <option value="az">A–Z</option>
        </select>
        <select
          value={testId}
          onChange={(e) => setTestId(e.target.value)}
          aria-label="Filter by test"
          className={`${field} max-w-full`}
        >
          <option value="">All tests</option>
          {testOptions.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      </div>

      <p className="text-sm text-slate-500" aria-live="polite">
        {shown.length === items.length
          ? `${items.length} ${items.length === 1 ? "word" : "words"}`
          : `${shown.length} of ${items.length} words`}
      </p>

      {shown.length === 0 ? (
        <Notice>No words match. Try another search or test.</Notice>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((item) => (
            <li key={item.word} className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p>
                  <span className="text-lg font-bold text-slate-900">{item.display}</span>
                  {item.partOfSpeech && <span className="ml-2 text-sm italic text-slate-500">{item.partOfSpeech}</span>}
                </p>
                <p className="text-sm text-slate-500">
                  {titles.has(item.testId) ? (
                    <Link href={`/test/${item.testId}`} className="font-medium text-sky-700 hover:underline">
                      {titles.get(item.testId)}
                    </Link>
                  ) : (
                    item.testId // test file was removed
                  )}
                  {" · "}
                  {formatDate(item.addedAt)}
                </p>
              </div>
              <div className="mt-2">
                <Bilingual en={item.meaningEn} uz={item.meaningUz} />
              </div>
              {Boolean(item.synonyms?.length || item.antonyms?.length) && (
                <div className="mt-3 flex flex-col gap-1.5">
                  <WordList label="Synonyms" words={item.synonyms} />
                  <WordList label="Antonyms" words={item.antonyms} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function WordList({ label, words }: { label: string; words?: string[] }) {
  if (!words?.length) return null;
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-sm">
      <span className="mr-1 font-semibold text-slate-500">{label}:</span>
      {words.map((w) => (
        <span key={w} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-slate-800">
          {w}
        </span>
      ))}
    </p>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-slate-500">
      {children}
    </p>
  );
}
