"use client";

import { useEffect, useRef, useState } from "react";
import type { CheckedAnswer } from "@/lib/answers";
import type { AnalyzeResponse } from "@/lib/schema";

type Done = Extract<AnalyzeResponse, { ok: true }>;

type Props = {
  passage: string;
  questions: string;
  mistakes: CheckedAnswer[];
};

// Calls /api/analyze once per mistake, one after another (free-tier rate limits).
// Day 3: shows a plain result list. The real analysis view comes on Day 4.
export default function AnalyzeMistakes({ passage, questions, mistakes }: Props) {
  const [results, setResults] = useState<Record<number, Done>>({});
  const [current, setCurrent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  const doneCount = mistakes.filter((m) => results[m.number]).length;
  const running = current !== null;

  async function run() {
    setError(null);
    for (const mistake of mistakes) {
      if (results[mistake.number]) continue;
      if (cancelled.current) return;
      setCurrent(mistake.number);
      let data: AnalyzeResponse;
      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ passage, questions, mistake }),
        });
        data = await res.json();
      } catch {
        data = { ok: false, error: "Could not reach the server." };
      }
      if (cancelled.current) return;
      if (!data.ok) {
        setError(`Question ${mistake.number}: ${data.error}`);
        setCurrent(null);
        return;
      }
      const done = data;
      setResults((prev) => ({ ...prev, [mistake.number]: done }));
    }
    setCurrent(null);
  }

  return (
    <section className="flex flex-col gap-4">
      {doneCount < mistakes.length && (
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="self-start rounded-md bg-zinc-900 px-5 py-2.5 font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {running
            ? `Explaining question ${current}…`
            : doneCount === 0
              ? "Explain my mistakes"
              : "Continue"}
        </button>
      )}

      {(running || doneCount > 0) && (
        <div className="flex items-center gap-3 text-sm">
          <progress value={doneCount} max={mistakes.length} className="h-2 w-48" />
          <span>
            {doneCount} / {mistakes.length} explained
          </span>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {error}
        </p>
      )}

      {mistakes
        .filter((m) => results[m.number])
        .map((m) => {
          const { analysis, evidence } = results[m.number];
          return (
            <article
              key={m.number}
              className="flex flex-col gap-2 rounded-md border border-zinc-200 p-4 text-sm dark:border-zinc-800"
            >
              <h3 className="font-medium">
                Q{m.number} · {analysis.questionType} · trap: {analysis.trap.type}
              </h3>
              {evidence ? (
                <blockquote className="border-l-4 border-amber-400 pl-3">{evidence.quote}</blockquote>
              ) : (
                <p className="text-zinc-600 dark:text-zinc-400">
                  Couldn&apos;t locate the evidence in the passage.
                </p>
              )}
              <p>{analysis.trap.explanationEn}</p>
              <p className="text-zinc-600 dark:text-zinc-400">{analysis.trap.explanationUz}</p>
              <details>
                <summary className="cursor-pointer text-zinc-600 dark:text-zinc-400">
                  Full analysis (raw)
                </summary>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-zinc-100 p-3 text-xs dark:bg-zinc-900">
                  {JSON.stringify(analysis, null, 2)}
                </pre>
              </details>
            </article>
          );
        })}
    </section>
  );
}
