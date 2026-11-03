"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import AnalyzeMistakes, { formatDuration } from "@/components/AnalyzeMistakes";
import ExplainSentence from "@/components/ExplainSentence";
import PacingReport from "@/components/PacingReport";
import Passage, { type Highlight } from "@/components/Passage";
import Questions from "@/components/Questions";
import type { EvidencePick, GradedAnswer } from "@/lib/answers";
import type { AnalyzeResponse } from "@/lib/schema";
import { saveMistake, saveSession } from "@/lib/db";
import { paceHint, type GroupTime, type PaceHint } from "@/lib/pacing";
import { selectionInParagraph } from "@/lib/selection";
import { storage, type EvidenceNote, type SavedResult } from "@/lib/storage";
import { allNumbers, groupNumbers, paragraphLabels, type PublicTest } from "@/lib/test-schema";
import { questionLabels } from "@/lib/test-text";

const noopSubscribe = () => () => {};

// Time per question group: it counts for the group she last clicked, focused or answered,
// including the time she spends in the passage looking for that group's answers.
type Pace = { ms: number[]; active: number | null; since: number };

function newPace(groups: number): Pace {
  return { ms: Array<number>(groups).fill(0), active: null, since: Date.now() };
}

// Adds the time since the last update to the active group and saves it (for a refresh).
function flushPace(pace: Pace, testId: string) {
  const now = Date.now();
  if (pace.active !== null) pace.ms[pace.active] += now - pace.since;
  pace.since = now;
  storage.writePace(testId, { ms: pace.ms, active: pace.active });
}

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

// Her submitted answers, rebuilt from the graded results (the attempt is cleared on submit).
function answersOf(results: GradedAnswer[]): Record<string, string> {
  return Object.fromEntries(results.filter((r) => r.given !== "").map((r) => [String(r.number), r.given]));
}

function Runner({ test }: { test: PublicTest }) {
  const [saved] = useState(() => ({
    attempt: storage.readAttempt(test.id),
    result: storage.readResult(test.id),
  }));

  const [answers, setAnswers] = useState<Record<string, string>>(saved.attempt?.answers ?? {});
  const [evidence, setEvidence] = useState<Record<string, EvidenceNote>>(saved.attempt?.evidence ?? {});
  const [picking, setPicking] = useState<number | null>(null);
  const [evidenceFor, setEvidenceFor] = useState<number | null>(null); // results: show this question's proof
  const [startedAt, setStartedAt] = useState(() => saved.attempt?.startedAt ?? Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [result, setResult] = useState<SavedResult | null>(saved.result);
  const [confirming, setConfirming] = useState<null | "unanswered" | "evidence">(null);
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
  const [initialPace] = useState<Pace>(() => {
    const p = storage.readPace(test.id);
    return p && p.ms.length === test.groups.length ? { ...p, since: Date.now() } : newPace(test.groups.length);
  });
  const pace = useRef(initialPace);
  const [dismissedHint, setDismissedHint] = useState<string | null>(null);

  const numbers = useMemo(() => allNumbers(test).sort((a, b) => a - b), [test]);
  // TRUE/FALSE and YES/NO questions: each answer needs evidence before submitting.
  const statementNumbers = useMemo(
    () => test.groups.flatMap((g) => (g.type === "tfng" || g.type === "ynng" ? groupNumbers(g) : [])),
    [test],
  );
  const groupOf = useMemo(
    () => new Map(test.groups.flatMap((g, i) => groupNumbers(g).map((n) => [n, i] as const))),
    [test],
  );
  const labels = useMemo(() => questionLabels(test), [test]);
  // A section can have several paragraphs; only the first carries the label ("C"), so the
  // following unlabeled paragraphs belong to the same section.
  const labelsByParagraph = useMemo(() => paragraphLabels(test), [test]);
  const phase = result ? "results" : "test";

  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
    };
  }, []);

  // Clock ticks only while she is solving. Group time is saved every tick.
  useEffect(() => {
    if (phase !== "test") return;
    const timer = setInterval(() => {
      setNow(Date.now());
      flushPace(pace.current, test.id);
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, test.id]);

  // Keep answers across a refresh.
  useEffect(() => {
    if (phase === "test") storage.writeAttempt(test.id, { answers, startedAt, evidence });
  }, [phase, test.id, answers, startedAt, evidence]);

  // Keep results and explanations, so Gemini calls are never wasted.
  useEffect(() => {
    if (result) storage.writeResult(test.id, result);
  }, [test.id, result]);

  const answeredCount = numbers.filter((n) => (answers[n] ?? "").trim() !== "").length;
  const unanswered = numbers.length - answeredCount;
  const missingEvidence = statementNumbers.filter((n) => (answers[n] ?? "").trim() !== "" && !evidence[n]);

  function setAnswer(n: number, value: string) {
    setAnswers((prev) => ({ ...prev, [n]: value }));
    setConfirming(null);
    trackGroup(groupOf.get(n) ?? null);
  }

  function setNote(n: number, note: EvidenceNote | null) {
    setEvidence((prev) => {
      const next = { ...prev };
      if (note === null) delete next[n];
      else next[n] = note;
      return next;
    });
    setConfirming(null);
    trackGroup(groupOf.get(n) ?? null);
  }

  // While she is highlighting evidence: the selected words in one paragraph become the evidence.
  function capturePick() {
    if (picking === null) return;
    const picked = selectionInParagraph();
    if (!picked) return;
    setNote(picking, picked);
    setPicking(null);
    window.getSelection()?.removeAllRanges();
  }

  function trackGroup(group: number | null) {
    if (phase !== "test" || group === null || group === pace.current.active) return;
    flushPace(pace.current, test.id);
    pace.current.active = group;
  }

  // A click or focus anywhere inside a question group makes it the active one.
  function onQuestionsActivity(e: React.SyntheticEvent) {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-group]");
    if (el) trackGroup(Number(el.dataset.group));
  }

  async function submit() {
    setSubmitting(true);
    setSubmitError(null);
    flushPace(pace.current, test.id);
    const groupTimes: GroupTime[] = test.groups.map((g, i) => ({
      groupIndex: i,
      type: g.type,
      ms: Math.round(pace.current.ms[i]),
      questions: groupNumbers(g).length,
    }));
    const cleaned = Object.fromEntries(
      Object.entries(answers).filter(([, v]) => v.trim() !== "").map(([k, v]) => [k, v.trim()]),
    );
    const picks: Record<string, EvidencePick> = Object.fromEntries(
      Object.entries(evidence).map(([n, note]) => [
        n,
        note === "none" ? "none" : { paragraph: note.paragraph, start: note.start, end: note.end },
      ]),
    );
    let data: { ok: true; results: GradedAnswer[] } | { ok: false; error: string };
    try {
      const res = await fetch(`/api/tests/${test.id}/grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: cleaned, evidence: picks }),
      });
      data = await res.json();
    } catch {
      data = { ok: false, error: "Could not reach the server. Your answers are saved; try again." };
    }
    setSubmitting(false);
    setConfirming(null);
    setPicking(null);
    if (!data.ok) {
      setSubmitError(data.error);
      return;
    }
    const finishedAt = Date.now();
    const next: SavedResult = {
      results: data.results,
      analyses: {},
      timeSpentMs: finishedAt - startedAt,
      finishedAt,
      groupTimes,
    };
    storage.clearAttempt(test.id);
    storage.clearPace(test.id);
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
          body: JSON.stringify({ testId: test.id, number: n, answers: answersOf(result.results) }),
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
    storage.clearPace(test.id);
    pace.current = newPace(test.groups.length);
    setDismissedHint(null);
    setAnswers({});
    setEvidence({});
    setPicking(null);
    setEvidenceFor(null);
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
      if (graded && !graded.isCorrect) selectMistake(n);
      document.getElementById(`r-${n}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function selectMistake(n: number | null) {
    setEvidenceFor(null);
    setSelected(n);
  }

  // After submit the passage highlights the proof she asked to see, or the selected mistake's evidence.
  const proof =
    phase === "results" && evidenceFor !== null
      ? result?.results.find((r) => r.number === evidenceFor)?.evidence?.proof
      : null;
  const shown = proof ?? (phase === "results" && selected !== null ? result?.analyses[selected]?.evidence : null);
  // Memoized so the passage only scrolls to the highlight when it actually changes.
  const highlight: Highlight | null = useMemo(
    () => (shown ? { paragraph: shown.paragraph, start: shown.start, end: shown.end } : null),
    [shown],
  );

  const remainingMs = test.minutes * 60_000 - (now - startedAt);
  const hint = phase === "test" ? paceHint(test.minutes, now - startedAt, answeredCount, numbers.length) : null;

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

      {hint && hint.id !== dismissedHint && <PaceBanner hint={hint} onDismiss={() => setDismissedHint(hint.id)} />}

      <main className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-2 md:overflow-hidden">
        <div
          className={`border-slate-200 bg-white md:overflow-y-auto md:border-r ${picking !== null ? "ring-4 ring-inset ring-sky-300" : ""}`}
          onPointerUp={picking !== null ? capturePick : undefined}
          onKeyUp={picking !== null ? capturePick : undefined}
        >
          {picking !== null && (
            <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-sky-200 bg-sky-50 px-5 py-2.5 text-sm text-sky-900">
              <p className="min-w-0 flex-1">
                Select the words that prove your answer to <span className="font-semibold">question {picking}</span>.
              </p>
              <button
                type="button"
                onClick={() => setPicking(null)}
                className="shrink-0 rounded-md border border-sky-300 bg-white px-2.5 py-1 font-medium hover:bg-sky-100"
              >
                Cancel
              </button>
            </div>
          )}
          <ExplainSentence testId={test.id} enabled={phase === "results"}>
            <Passage test={test} highlight={highlight} />
          </ExplainSentence>
        </div>
        <div
          ref={rightPane}
          className="bg-slate-50 md:overflow-y-auto"
          onFocus={phase === "test" ? onQuestionsActivity : undefined}
          onPointerDown={phase === "test" ? onQuestionsActivity : undefined}
        >
          {result ? (
            <AnalyzeMistakes
              testId={test.id}
              results={result.results}
              analyses={result.analyses}
              labels={labels}
              paragraphLabels={labelsByParagraph}
              timeSpentMs={result.timeSpentMs}
              pacing={
                result.groupTimes && (
                  <PacingReport test={test} groupTimes={result.groupTimes} timeSpentMs={result.timeSpentMs} />
                )
              }
              selected={selected}
              onSelect={selectMistake}
              evidenceFor={evidenceFor}
              onShowEvidence={setEvidenceFor}
              explaining={explaining}
              error={explainError}
              onExplain={explain}
            />
          ) : (
            <Questions
              test={test}
              answers={answers}
              onAnswer={setAnswer}
              evidence={{
                notes: evidence,
                picking,
                onPick: (n) => {
                  setPicking(n);
                  trackGroup(groupOf.get(n) ?? null);
                },
                onNone: (n) => setNote(n, "none"),
                onClear: (n) => setNote(n, null),
                onCancel: () => setPicking(null),
              }}
            />
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
            {confirming === "evidence" ? (
              <>
                <span className="text-sm text-slate-700">
                  Add evidence first: {missingEvidence.length === 1 ? "question" : "questions"} {missingEvidence.join(", ")}.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setConfirming(null);
                    goTo(missingEvidence[0]);
                  }}
                  className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
                >
                  Go to question {missingEvidence[0]}
                </button>
              </>
            ) : confirming === "unanswered" ? (
              <>
                <span className="text-sm text-slate-700">
                  {unanswered} unanswered. Submit anyway?
                </span>
                <button
                  type="button"
                  onClick={() => setConfirming(null)}
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
                  onClick={() =>
                    // Evidence is required while there is time; when time is up she can still submit.
                    missingEvidence.length > 0 && remainingMs > 0
                      ? setConfirming("evidence")
                      : unanswered > 0
                        ? setConfirming("unanswered")
                        : submit()
                  }
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

function PaceBanner({ hint, onDismiss }: { hint: PaceHint; onDismiss: () => void }) {
  const style =
    hint.tone === "good"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : hint.tone === "behind"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-sky-200 bg-sky-50 text-sky-900";
  return (
    <div role="status" className={`flex shrink-0 items-center gap-3 border-b px-4 py-2 text-sm ${style}`}>
      <span aria-hidden>⏱</span>
      <p className="min-w-0 flex-1">{hint.text}</p>
      <button type="button" onClick={onDismiss} className="shrink-0 rounded px-2 py-0.5 font-semibold hover:bg-white/60">
        OK
      </button>
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
