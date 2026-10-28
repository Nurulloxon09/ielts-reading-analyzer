"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import AnalysisCard, { TRAP_LABELS } from "@/components/AnalysisCard";
import Passage, { type Highlight } from "@/components/Passage";
import Questions from "@/components/Questions";
import type { GradedAnswer } from "@/lib/answers";
import {
  getReplayStats,
  listDueReplays,
  recordReplay,
  retireReplay,
  REPLAY_DAYS,
  type DueReplay,
  type Replay,
  type ReplayStats,
} from "@/lib/db";
import { allNumbers, paragraphLabels, type PublicTest } from "@/lib/test-schema";
import { onlyQuestion } from "@/lib/test-text";

type Status =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "error"; error: string }
  | { state: "done"; right: boolean; correct: string[]; replay: Replay };

type TestResponse = { ok: true; test: PublicTest } | { ok: false; error: string };
type GradeResponse = { ok: true; results: GradedAnswer[] } | { ok: false; error: string };

const DAY = 24 * 60 * 60 * 1000;

// /replay: her due mistakes, one question at a time, with no explanation until she answers.
// Grading stays on the server. No Gemini calls.
export default function MistakeReplay() {
  const [items, setItems] = useState<DueReplay[] | null>(null); // null = loading
  const [blocked, setBlocked] = useState(false);
  const [stats, setStats] = useState<{ stats: ReplayStats; at: number } | null>(null);
  const [index, setIndex] = useState(0);
  const [tests, setTests] = useState<Record<string, PublicTest>>({});
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const [tally, setTally] = useState({ right: 0, wrong: 0 });
  const rightPane = useRef<HTMLDivElement>(null);

  // The list is fixed when the page opens, so answering one does not reshuffle the rest.
  useEffect(() => {
    let active = true;
    Promise.all([listDueReplays(), getReplayStats()]).then(([due, s]) => {
      if (!active) return;
      setItems(due ?? []);
      setBlocked(due === null);
      if (s) setStats({ stats: s, at: Date.now() });
    });
    return () => {
      active = false;
    };
  }, []);

  const current = items?.[index];
  const test = current ? tests[current.replay.testId] : undefined;

  // Load the current item's test (without the answer key). A test or question that no
  // longer exists is retired and skipped.
  useEffect(() => {
    if (!current || test) return;
    let active = true;
    const { id, testId, questionNumber } = current.replay;
    fetch(`/api/tests/${testId}`)
      .then((res) => res.json() as Promise<TestResponse>)
      .then(async (data) => {
        if (!active) return;
        if (data.ok && allNumbers(data.test).includes(questionNumber)) {
          setTests((t) => ({ ...t, [testId]: data.test }));
        } else if (!data.ok && data.error === "This test does not exist.") {
          await retireReplay(id);
          if (active) setIndex((i) => i + 1);
        } else {
          setStatus({ state: "error", error: data.ok ? "This question is no longer in the test." : data.error });
        }
      })
      .catch(() => active && setStatus({ state: "error", error: "Could not reach the server." }));
    return () => {
      active = false;
    };
  }, [current, test]);

  async function check() {
    if (!current || !answer.trim() || status.state === "checking") return;
    const { id, testId, questionNumber } = current.replay;
    setStatus({ state: "checking" });

    let data: GradeResponse;
    try {
      const res = await fetch(`/api/tests/${testId}/grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: { [questionNumber]: answer.trim() } }),
      });
      data = await res.json();
    } catch {
      data = { ok: false, error: "Could not reach the server." };
    }
    const graded = data.ok ? data.results.find((r) => r.number === questionNumber) : undefined;
    if (!graded) {
      setStatus({ state: "error", error: data.ok ? "This question is no longer in the test." : data.error });
      return;
    }

    const right = graded.isCorrect;
    const saved = await recordReplay(id, right);
    // If IndexedDB is blocked the result is still shown; it just isn't remembered.
    const replay: Replay = saved ?? { ...current.replay, lastResult: right ? "right" : "wrong" };
    setStatus({ state: "done", right, correct: graded.correct, replay });
    setTally((t) => (right ? { ...t, right: t.right + 1 } : { ...t, wrong: t.wrong + 1 }));
  }

  async function next() {
    setAnswer("");
    setStatus({ state: "idle" });
    setIndex((i) => i + 1);
    rightPane.current?.scrollTo({ top: 0 });
    if (items && index + 1 >= items.length) {
      const s = await getReplayStats();
      if (s) setStats({ stats: s, at: Date.now() });
    }
  }

  const evidence = status.state === "done" && !status.right ? current?.mistake.evidence : null;
  const highlight: Highlight | null = useMemo(
    () => (evidence ? { paragraph: evidence.paragraph, start: evidence.start, end: evidence.end } : null),
    [evidence],
  );
  const single = useMemo(
    () => (test && current ? onlyQuestion(test, current.replay.questionNumber) : null),
    [test, current],
  );

  if (items === null) return <Centered>Loading…</Centered>;

  if (blocked) {
    return (
      <Centered>
        <p>This browser is blocking saved data, so your mistakes can&apos;t be shown.</p>
        <BackHome />
      </Centered>
    );
  }

  if (!current) {
    const finished = tally.right + tally.wrong > 0;
    return (
      <Centered>
        <h1 className="text-2xl font-bold text-slate-900">{finished ? "All done for now" : "Nothing to re-try right now"}</h1>
        {finished ? (
          <p className="mt-2 text-[15px] text-slate-600">
            <span className="font-semibold text-emerald-700">{tally.right} right</span> ·{" "}
            <span className="font-semibold text-rose-700">{tally.wrong} wrong</span>
          </p>
        ) : (
          <p className="mt-2 text-[15px] text-slate-600">
            A question you explained comes back {REPLAY_DAYS.first} days later, so you can try it again.
          </p>
        )}
        {stats?.stats.nextDueAt && (
          <p className="mt-1 text-sm text-slate-500">Next re-try: {inDays(stats.stats.nextDueAt, stats.at)}.</p>
        )}
        {stats && <StillFailing stats={stats.stats} />}
        <BackHome />
      </Centered>
    );
  }

  const { mistake, replay } = current;
  const n = replay.questionNumber;
  const done = status.state === "done";
  const labels = test ? paragraphLabels(test) : [];

  return (
    <div className="flex h-dvh flex-col bg-slate-100 text-slate-900">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-4">
        <Link href="/" className="shrink-0 rounded-md px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900">
          ← All tests
        </Link>
        <p className="min-w-0 flex-1 truncate text-[15px] font-semibold">Re-try your mistakes</p>
        <p className="shrink-0 text-sm text-slate-600">
          {index + 1} of {items.length}
        </p>
      </header>

      <main className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-2 md:overflow-hidden">
        <div className="border-slate-200 bg-white md:overflow-y-auto md:border-r">
          {test ? <Passage test={test} highlight={highlight} /> : <p className="p-8 text-slate-500">Loading passage…</p>}
        </div>

        <div ref={rightPane} className="bg-slate-50 md:overflow-y-auto">
          <div className="mx-auto flex max-w-[46rem] flex-col gap-4 px-6 pt-6 md:px-8">
            <p className="text-sm text-slate-600">
              From <span className="font-semibold text-slate-900">{test?.title ?? replay.testId}</span>. You got question{" "}
              {n} wrong before. Try it again.
            </p>
          </div>

          {single && (
            <fieldset disabled={status.state === "checking" || done} className="min-w-0">
              <Questions test={single} answers={{ [n]: answer }} onAnswer={(_, value) => setAnswer(value)} />
            </fieldset>
          )}

          <div className="mx-auto flex max-w-[46rem] flex-col gap-4 px-6 pb-10 md:px-8">
            {status.state === "error" && (
              <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                {status.error}
              </p>
            )}

            {status.state === "done" && (
              <ReplayFeedback status={status} given={answer.trim()} previous={mistake.given} />
            )}

            <div className="flex flex-wrap items-center gap-3">
              {done ? (
                <button
                  type="button"
                  onClick={next}
                  className="rounded-md bg-sky-600 px-5 py-2.5 text-[15px] font-semibold text-white shadow-sm hover:bg-sky-700"
                >
                  {index + 1 < items.length ? "Next question →" : "Finish"}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={check}
                    disabled={!single || !answer.trim() || status.state === "checking"}
                    className="rounded-md bg-sky-600 px-5 py-2.5 text-[15px] font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-60"
                  >
                    {status.state === "checking" ? "Checking…" : "Check"}
                  </button>
                  <button
                    type="button"
                    onClick={next}
                    disabled={status.state === "checking"}
                    className="px-2 py-2 text-sm font-medium text-slate-500 hover:text-slate-900 disabled:opacity-60"
                  >
                    Skip for now
                  </button>
                </>
              )}
            </div>

            {status.state === "done" && !status.right && (
              <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-5 py-5">
                <h3 className="text-base font-bold text-slate-900">Your explanation from last time</h3>
                <AnalysisCard
                  result={{ ok: true, analysis: mistake.analysis, evidence: mistake.evidence }}
                  paragraphLabel={mistake.evidence ? (labels[mistake.evidence.paragraph] ?? null) : null}
                />
              </section>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function ReplayFeedback({
  status,
  given,
  previous,
}: {
  status: Extract<Status, { state: "done" }>;
  given: string;
  previous: string;
}) {
  const { right, correct, replay } = status;
  if (right) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-5 py-4">
        <p className="text-[15px] font-bold text-emerald-800">✓ Correct!</p>
        <p className="mt-1 text-[15px] text-slate-800">
          {replay.retiredAt !== null
            ? "Right twice in a row. You have mastered this question, so it won't come back."
            : `It comes back once more in ${REPLAY_DAYS.afterRight} days, to make sure you remember.`}
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50/60 px-5 py-4">
      <p className="text-[15px] font-bold text-rose-800">✗ Not yet</p>
      <p className="mt-1 text-[15px] text-slate-800">
        You: <span className="font-semibold text-rose-700 line-through decoration-rose-300">{given}</span> · Correct:{" "}
        <span className="font-semibold text-emerald-700">{correct.join(" / ")}</span>
      </p>
      <p className="mt-0.5 text-sm text-slate-600">Last time you answered: {previous || "no answer"}</p>
      <p className="mt-1 text-sm text-slate-600">It comes back in {REPLAY_DAYS.afterWrong} days. Read your explanation below.</p>
    </div>
  );
}

function StillFailing({ stats }: { stats: ReplayStats }) {
  if (stats.stillFailing.length === 0) return null;
  return (
    <section className="mt-6 w-full rounded-xl border border-slate-200 bg-white px-5 py-4 text-left">
      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Still failing, by mistake type</h2>
      <ul className="mt-2 flex flex-col gap-1.5">
        {stats.stillFailing.map((s) => (
          <li key={s.trapType} className="flex items-center justify-between gap-4 text-[15px]">
            <span className="text-slate-800">{TRAP_LABELS[s.trapType] ?? s.trapType}</span>
            <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-sm font-semibold text-rose-800">{s.count}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-slate-500">A question leaves this list when you get it right twice in a row.</p>
    </section>
  );
}

function inDays(at: number, now: number): string {
  const days = Math.max(1, Math.ceil((at - now) / DAY));
  return days === 1 ? "tomorrow" : `in ${days} days`;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col items-center px-5 py-16 text-center text-slate-600">
      {children}
    </main>
  );
}

function BackHome() {
  return (
    <Link href="/" className="mt-6 text-sm font-semibold text-sky-700 hover:underline">
      ← Back to tests
    </Link>
  );
}
