"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import AnalyzeMistakes, { formatDuration } from "@/components/AnalyzeMistakes";
import ExplainSentence from "@/components/ExplainSentence";
import Passage, { type Highlight } from "@/components/Passage";
import Questions from "@/components/Questions";
import type { GradedAnswer } from "@/lib/answers";
import type { AnalyzeResponse } from "@/lib/schema";
import { saveMistake, saveSession } from "@/lib/db";
import { storage, type SavedResult } from "@/lib/storage";
import { allNumbers, type PublicTest } from "@/lib/test-schema";
import { questionLabels } from "@/lib/test-text";

const noopSubscribe = () => () => {};

// The test needs the browser (saved answers, the clock), so it renders after hydration.
export default function TestRunner({ test }: { test: PublicTest }) {
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!isClient) return <TestLoading />;
  return <Runner test={test} />;
}

export function TestLoading() {
  return <div className="flex h-dvh items-center justify-center bg-slate-100 text-slate-500">Loading test…</div>;
}

function firstMistake(result: SavedResult | null): number | null {
  return result?.results.find((r) => !r.isCorrect)?.number ?? null;
}

function Runner({ test }: { test: PublicTest }) {
  const [saved] = useState(() => ({
    attempt: storage.readAttempt(test.id),
    result: storage.readResult(test.id),
  }));

  const [answers, setAnswers] = useState<Record<string, string>>(saved.attempt?.answers ?? {});
  const [startedAt, setStartedAt] = useState(() => saved.attempt?.startedAt ?? Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [result, setResult] = useState<SavedResult | null>(saved.result);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(() => firstMistake(saved.result));
  const [explaining, setExplaining] = useState<number | null>(null);
  const [explainError, setExplainError] = useState<string | null>(null);
  const rightPane = useRef<HTMLDivElement>(null);
  const unmounted = useRef(false);
  const sessionRef = useRef<Promise<number | null> | null>(
    saved.result?.sessionId !== undefined ? Promise.resolve(saved.result.sessionId) : null,
  );

  const numbers = useMemo(() => allNumbers(test).sort((a, b) => a - b), [test]);
  const labels = useMemo(() => questionLabels(test), [test]);
  // A section can have several paragraphs; only the first carries the label ("C"), so the
  // following unlabeled paragraphs belong to the same section.
  const paragraphLabels = useMemo(() => {
    let current: string | undefined;
    return test.passage.paragraphs.map((p) => (current = p.label ?? current));
  }, [test]);
  const phase = result ? "results" : "test";

  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
    };
  }, []);

  // Clock ticks only while she is solving.
  useEffect(() => {
    if (phase !== "test") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  // Keep answers across a refresh.
  useEffect(() => {
    if (phase === "test") storage.writeAttempt(test.id, { answers, startedAt });
  }, [phase, test.id, answers, startedAt]);

  // Keep results and explanations, so Gemini calls are never wasted.
  useEffect(() => {
    if (result) storage.writeResult(test.id, result);
  }, [test.id, result]);

  const answeredCount = numbers.filter((n) => (answers[n] ?? "").trim() !== "").length;
  const unanswered = numbers.length - answeredCount;

  function setAnswer(n: number, value: string) {
    setAnswers((prev) => ({ ...prev, [n]: value }));
    setConfirming(false);
  }

  async function submit() {
    setSubmitting(true);
    setSubmitError(null);
    const cleaned = Object.fromEntries(
      Object.entries(answers).filter(([, v]) => v.trim() !== "").map(([k, v]) => [k, v.trim()]),
    );
    let data: { ok: true; results: GradedAnswer[] } | { ok: false; error: string };
    try {
      const res = await fetch(`/api/tests/${test.id}/grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: cleaned }),
      });
      data = await res.json();
    } catch {
      data = { ok: false, error: "Could not reach the server. Your answers are saved; try again." };
    }
    setSubmitting(false);
    setConfirming(false);
    if (!data.ok) {
      setSubmitError(data.error);
      return;
    }
    const finishedAt = Date.now();
    const next: SavedResult = { results: data.results, analyses: {}, timeSpentMs: finishedAt - startedAt, finishedAt };
    storage.clearAttempt(test.id);
    setResult(next);
    setSelected(firstMistake(next));
    rightPane.current?.scrollTo({ top: 0 });

    void ensureSession(next);
  }

  // One IndexedDB session per attempt. The pending save is shared, so explaining a mistake
  // right after submitting never creates a second session. Results saved before the mistake
  // log existed get their session on first use.
  function ensureSession(current: SavedResult): Promise<number | null> {
    sessionRef.current ??= saveSession({ testId: test.id, title: test.title, ...current }).then((sessionId) => {
      if (sessionId !== null) {
        setResult((prev) => (prev && prev.finishedAt === current.finishedAt ? { ...prev, sessionId } : prev));
      }
      return sessionId;
    });
    return sessionRef.current;
  }

  // One Gemini call at a time (free-tier limits).
  async function explain(toExplain: number[]) {
    if (!result) return;
    setExplainError(null);
    for (const n of toExplain) {
      const graded = result.results.find((r) => r.number === n);
      if (!graded || graded.isCorrect || result.analyses[n]) continue;
      setExplaining(n);
      let data: AnalyzeResponse;
      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ testId: test.id, number: n, given: graded.given }),
        });
        data = await res.json();
      } catch {
        data = { ok: false, error: "Could not reach the server." };
      }
      if (unmounted.current) return;
      if (!data.ok) {
        setExplainError(`Question ${n}: ${data.error}`);
        setExplaining(null);
        return;
      }
      const done = data;
      setResult((prev) => (prev ? { ...prev, analyses: { ...prev.analyses, [n]: done } } : prev));

      const sessionId = await ensureSession(result);
      if (sessionId !== null) {
        void saveMistake({ sessionId, testId: test.id, graded, analysis: done.analysis, evidence: done.evidence });
      }
    }
    setExplaining(null);
  }

  function retake() {
    sessionRef.current = null;
    storage.clearResult(test.id);
    storage.clearAttempt(test.id);
    setAnswers({});
    setStartedAt(Date.now());
    setNow(Date.now());
    setResult(null);
    setSelected(null);
    setExplainError(null);
    setSubmitError(null);
    rightPane.current?.scrollTo({ top: 0 });
  }

  function goTo(n: number) {
    if (phase === "test") {
      const el = document.getElementById(`q-${n}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      const input =
        el?.querySelector<HTMLElement>("input:checked") ?? el?.querySelector<HTMLElement>("input, select");
      input?.focus({ preventScroll: true });
    } else {
      const graded = result?.results.find((r) => r.number === n);
      if (graded && !graded.isCorrect) setSelected(n);
      document.getElementById(`r-${n}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  const evidence = phase === "results" && selected !== null ? result?.analyses[selected]?.evidence : null;
  // Memoized so the passage only scrolls to the highlight when it actually changes.
  const highlight: Highlight | null = useMemo(
    () => (evidence ? { paragraph: evidence.paragraph, start: evidence.start, end: evidence.end } : null),
    [evidence],
  );

  const remainingMs = test.minutes * 60_000 - (now - startedAt);

  return (
    <div className="flex h-dvh flex-col bg-slate-100 text-slate-900">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-4">
        <Link href="/" className="shrink-0 rounded-md px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900">
          ← All tests
        </Link>
        <p className="min-w-0 flex-1 truncate text-[15px] font-semibold">{test.title}</p>
        {phase === "test" ? (
          <Clock remainingMs={remainingMs} />
        ) : (
          <button
            type="button"
            onClick={retake}
            disabled={explaining !== null}
            className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            Retake test
          </button>
        )}
      </header>

      <main className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-2 md:overflow-hidden">
        <div className="border-slate-200 bg-white md:overflow-y-auto md:border-r">
          <ExplainSentence testId={test.id} enabled={phase === "results"}>
            <Passage test={test} highlight={highlight} />
          </ExplainSentence>
        </div>
        <div ref={rightPane} className="bg-slate-50 md:overflow-y-auto">
          {result ? (
            <AnalyzeMistakes
              results={result.results}
              analyses={result.analyses}
              labels={labels}
              paragraphLabels={paragraphLabels}
              timeSpentMs={result.timeSpentMs}
              selected={selected}
              onSelect={setSelected}
              explaining={explaining}
              error={explainError}
              onExplain={explain}
            />
          ) : (
            <Questions test={test} answers={answers} onAnswer={setAnswer} />
          )}
        </div>
      </main>

      <footer className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-200 bg-white px-4 py-2.5">
        <nav aria-label="Questions" className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {numbers.map((n) => {
            const graded = result?.results.find((r) => r.number === n);
            const answered = (answers[n] ?? "").trim() !== "";
            const style = graded
              ? graded.isCorrect
                ? "border-emerald-600 bg-emerald-600 text-white"
                : `border-rose-600 bg-rose-600 text-white ${selected === n ? "ring-2 ring-rose-300 ring-offset-1" : ""}`
              : answered
                ? "border-slate-800 bg-slate-800 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:border-slate-500";
            return (
              <button
                key={n}
                type="button"
                onClick={() => goTo(n)}
                aria-label={`Question ${n}${graded ? (graded.isCorrect ? ", correct" : ", wrong") : answered ? ", answered" : ""}`}
                className={`size-8 rounded-full border text-[13px] font-semibold transition-colors ${style}`}
              >
                {n}
              </button>
            );
          })}
        </nav>

        {phase === "test" && (
          <div className="flex shrink-0 items-center gap-3">
            {submitError && <span className="max-w-xs text-sm text-rose-700">{submitError}</span>}
            {confirming ? (
              <>
                <span className="text-sm text-slate-700">
                  {unanswered} unanswered. Submit anyway?
                </span>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  Keep working
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={submitting}
                  className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
                >
                  {submitting ? "Checking…" : "Submit"}
                </button>
              </>
            ) : (
              <>
                <span className="text-sm text-slate-500">
                  {answeredCount} of {numbers.length} answered
                </span>
                <button
                  type="button"
                  onClick={() => (unanswered > 0 ? setConfirming(true) : submit())}
                  disabled={submitting}
                  className="rounded-md bg-sky-600 px-5 py-2 text-[15px] font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-60"
                >
                  {submitting ? "Checking…" : "Submit test"}
                </button>
              </>
            )}
          </div>
        )}
      </footer>
    </div>
  );
}

function Clock({ remainingMs }: { remainingMs: number }) {
  const over = remainingMs < 0;
  const low = !over && remainingMs < 5 * 60_000;
  return (
    <p
      aria-label="Time left"
      className={`shrink-0 rounded-md px-3 py-1 font-mono text-[15px] font-semibold tabular-nums ${
        over ? "bg-rose-50 text-rose-700" : low ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-800"
      }`}
    >
      {over ? `Time's up +${formatDuration(-remainingMs)}` : `${formatDuration(remainingMs)} left`}
    </p>
  );
}
