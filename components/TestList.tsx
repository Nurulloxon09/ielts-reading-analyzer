"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listFinished, type FinishedTest } from "@/lib/db";
import { storage } from "@/lib/storage";

export type TestSummary = { id: string; title: string; passageNumber: number; questions: number; minutes: number };

type Finished = FinishedTest & { hasResult: boolean }; // hasResult: her last result is still saved, so it opens on the results

const PASSAGES = [1, 2, 3];

// Home page: tests she hasn't done yet, grouped by Passage 1, 2 and 3, then the ones she
// has finished, newest first, with her latest score.
export default function TestList({ tests }: { tests: TestSummary[] }) {
  const [finished, setFinished] = useState<Map<string, Finished> | null>(null);

  useEffect(() => {
    let active = true;
    listFinished().then((sessions) => {
      if (!active) return;
      // Results saved before the attempt log existed are only in localStorage.
      const all = new Map<string, Finished>();
      for (const t of tests) {
        const saved = storage.readResult(t.id);
        const fromResult = saved && {
          correct: saved.results.filter((r) => r.isCorrect).length,
          total: saved.results.length,
          finishedAt: saved.finishedAt,
        };
        const fromLog = sessions?.get(t.id);
        const latest = fromLog && fromResult ? (fromLog.finishedAt >= fromResult.finishedAt ? fromLog : fromResult) : (fromLog ?? fromResult);
        if (latest) all.set(t.id, { ...latest, hasResult: saved !== null });
      }
      setFinished(all);
    });
    return () => {
      active = false;
    };
  }, [tests]);

  if (tests.length === 0) {
    return (
      <p className="mt-10 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-slate-500">
        No tests yet.
      </p>
    );
  }

  const done = tests
    .filter((t) => finished?.has(t.id))
    .sort((a, b) => finished!.get(b.id)!.finishedAt - finished!.get(a.id)!.finishedAt);

  // Hidden for the moment it takes to read what she has finished, so cards don't jump between sections.
  return (
    <div className={finished ? undefined : "invisible"} aria-busy={!finished}>
      {PASSAGES.map((n) => {
        const inPassage = tests.filter((t) => t.passageNumber === n);
        if (inPassage.length === 0) return null;
        const todo = inPassage.filter((t) => !finished?.has(t.id));
        return (
          <Section key={n} title={`Passage ${n}`} note={todo.length > 0 ? `${todo.length} to do` : undefined}>
            {todo.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 px-5 py-4 text-sm text-slate-500">
                All Passage {n} tests finished. Nice work!
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {todo.map((t) => (
                  <li key={t.id}>
                    <TestCard test={t} />
                  </li>
                ))}
              </ul>
            )}
          </Section>
        );
      })}

      {done.length > 0 && (
        <Section title="Finished" note={`${done.length} ${done.length === 1 ? "test" : "tests"}`}>
          <ul className="flex flex-col gap-3">
            {done.map((t) => (
              <li key={t.id}>
                <TestCard test={t} finished={finished!.get(t.id)} />
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="mb-3 flex items-baseline gap-2 text-lg font-bold text-slate-900">
        {title}
        {note && <span className="text-sm font-normal text-slate-500">· {note}</span>}
      </h2>
      {children}
    </section>
  );
}

const shortDate = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

function TestCard({ test, finished }: { test: TestSummary; finished?: Finished }) {
  const details = finished
    ? [`${finished.correct}/${finished.total} correct`, `finished ${shortDate(finished.finishedAt)}`]
    : [`${test.questions} questions`, `${test.minutes} min`];

  return (
    <Link
      href={`/test/${test.id}`}
      className="group flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm transition hover:border-sky-400 hover:shadow"
    >
      <span
        className={`flex size-11 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${
          finished ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700"
        }`}
      >
        P{test.passageNumber}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[17px] font-semibold text-slate-900">{test.title}</span>
        <span className="mt-0.5 block text-sm text-slate-500">{details.join(" · ")}</span>
      </span>
      <span
        className={`shrink-0 rounded-md px-4 py-2 text-sm font-semibold ${
          finished
            ? "border border-slate-300 bg-white text-slate-700 group-hover:border-sky-400 group-hover:text-sky-700"
            : "bg-sky-600 text-white group-hover:bg-sky-700"
        }`}
      >
        {!finished ? "Start" : finished.hasResult ? "Review" : "Open"}
      </span>
    </Link>
  );
}
