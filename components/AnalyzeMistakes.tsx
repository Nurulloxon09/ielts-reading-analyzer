"use client";

import AddToVocab from "@/components/AddToVocab";
import AnalysisCard from "@/components/AnalysisCard";
import type { GradedAnswer } from "@/lib/answers";
import type { AnalysisResult } from "@/lib/storage";

type Props = {
  testId: string;
  results: GradedAnswer[];
  analyses: Record<number, AnalysisResult>;
  labels: Map<number, string>;
  paragraphLabels: (string | undefined)[];
  timeSpentMs: number;
  selected: number | null;
  onSelect: (n: number | null) => void;
  explaining: number | null;
  error: string | null;
  onExplain: (numbers: number[]) => void;
};

export function formatDuration(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Results pane: score, then every question; wrong ones open into their analysis.
export default function AnalyzeMistakes({
  testId,
  results,
  analyses,
  labels,
  paragraphLabels,
  timeSpentMs,
  selected,
  onSelect,
  explaining,
  error,
  onExplain,
}: Props) {
  const mistakes = results.filter((r) => !r.isCorrect);
  const correctCount = results.length - mistakes.length;
  const pending = mistakes.filter((m) => !analyses[m.number]).map((m) => m.number);
  const explainedCount = mistakes.length - pending.length;

  return (
    <div className="mx-auto flex max-w-[46rem] flex-col gap-6 px-6 py-6 md:px-8">
      <section className="rounded-xl border border-slate-200 bg-white px-6 py-5">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Your result</p>
        <p className="mt-1 text-4xl font-bold text-slate-900">
          {correctCount}
          <span className="text-2xl font-semibold text-slate-400"> / {results.length}</span>
        </p>
        <p className="mt-1 text-[15px] text-slate-600">
          {mistakes.length === 0
            ? "No mistakes. Well done!"
            : `${mistakes.length} ${mistakes.length === 1 ? "mistake" : "mistakes"} to learn from`}{" "}
          · finished in {formatDuration(timeSpentMs)}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="text-sm text-slate-500">Tip: select any sentence in the passage to see it explained.</p>
          <AddToVocab testId={testId} />
        </div>

        {mistakes.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-4">
            {pending.length > 0 && (
              <button
                type="button"
                onClick={() => onExplain(pending)}
                disabled={explaining !== null}
                className="rounded-md bg-sky-600 px-5 py-2.5 text-[15px] font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-60"
              >
                {explaining !== null
                  ? `Explaining question ${explaining}…`
                  : explainedCount === 0
                    ? "Explain my mistakes"
                    : "Explain the rest"}
              </button>
            )}
            <div className="flex items-center gap-3 text-sm text-slate-600">
              <span className="h-2 w-40 overflow-hidden rounded-full bg-slate-200" aria-hidden>
                <span
                  className="block h-full rounded-full bg-sky-600 transition-[width]"
                  style={{ width: `${(explainedCount / mistakes.length) * 100}%` }}
                />
              </span>
              {explainedCount} / {mistakes.length} explained
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </p>
        )}
      </section>

      <ol className="flex flex-col gap-3">
        {results.map((r) => {
          const open = selected === r.number;
          const result = analyses[r.number];
          const paragraph = result?.evidence ? paragraphLabels[result.evidence.paragraph] ?? null : null;
          return (
            <li
              key={r.number}
              id={`r-${r.number}`}
              className={`scroll-mt-4 rounded-xl border bg-white ${
                open ? "border-sky-400 shadow-sm ring-2 ring-sky-100" : "border-slate-200"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(open ? null : r.number)}
                disabled={r.isCorrect}
                aria-expanded={r.isCorrect ? undefined : open}
                className="flex w-full items-start gap-3 px-5 py-4 text-left disabled:cursor-default"
              >
                <span
                  aria-label={r.isCorrect ? "Correct" : "Wrong"}
                  className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${
                    r.isCorrect ? "bg-emerald-600" : "bg-rose-600"
                  }`}
                >
                  {r.number}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-[15px] leading-snug text-slate-900">{labels.get(r.number)}</span>
                  <span className="text-sm">
                    {r.isCorrect ? (
                      <span className="font-semibold text-emerald-700">{r.given}</span>
                    ) : (
                      <>
                        <span className="text-slate-500">You: </span>
                        <span className="font-semibold text-rose-700 line-through decoration-rose-300">
                          {r.given || "no answer"}
                        </span>
                        <span className="text-slate-500"> · Correct: </span>
                        <span className="font-semibold text-emerald-700">{r.correct.join(" / ")}</span>
                      </>
                    )}
                  </span>
                </span>
                {!r.isCorrect && (
                  <span className="mt-1 shrink-0 text-sm font-medium text-sky-700">
                    {result ? (open ? "Hide" : "Show why") : explaining === r.number ? "Explaining…" : open ? "Hide" : "Open"}
                  </span>
                )}
              </button>

              {open && !r.isCorrect && (
                <div className="border-t border-slate-200 px-5 py-5">
                  {result ? (
                    <AnalysisCard result={result} paragraphLabel={paragraph} />
                  ) : explaining === r.number ? (
                    <p className="text-[15px] text-slate-600">Explaining this question…</p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-[15px] text-slate-600">Not explained yet.</p>
                      <button
                        type="button"
                        onClick={() => onExplain([r.number])}
                        disabled={explaining !== null}
                        className="rounded-md border border-sky-600 px-3 py-1.5 text-sm font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-60"
                      >
                        Explain this one
                      </button>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
