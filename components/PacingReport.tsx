"use client";

import { formatDuration } from "@/components/AnalyzeMistakes";
import {
  TARGET_MS_PER_QUESTION,
  TYPE_LABELS,
  minutesPerQuestion,
  paceByType,
  paceStatus,
  type GroupTime,
  type PaceStatus,
} from "@/lib/pacing";
import type { PublicTest } from "@/lib/test-schema";
import { groupRange } from "@/lib/test-text";

const STATUS: Record<PaceStatus, { label: string; text: string; bar: string }> = {
  ok: { label: "On time", text: "text-emerald-700", bar: "bg-emerald-500" },
  slow: { label: "A bit slow", text: "text-amber-700", bar: "bg-amber-500" },
  very_slow: { label: "Too slow", text: "text-rose-700", bar: "bg-rose-500" },
};

// After submit: time on each question group against about 1 minute per question.
export default function PacingReport({
  test,
  groupTimes,
  timeSpentMs,
}: {
  test: PublicTest;
  groupTimes: GroupTime[];
  timeSpentMs: number;
}) {
  const rows = groupTimes.filter((g) => g.questions > 0 && test.groups[g.groupIndex]);
  const scale = Math.max(1, ...rows.map((g) => Math.max(g.ms, g.questions * TARGET_MS_PER_QUESTION)));
  const outside = timeSpentMs - rows.reduce((sum, g) => sum + g.ms, 0);
  const types = paceByType(rows);

  return (
    <section className="rounded-xl border border-slate-200 bg-white px-6 py-5">
      <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Your pacing</p>
      <p className="mt-1 text-sm text-slate-600">Target: about 1 minute per question. The grey line is the target.</p>

      <ul className="mt-4 flex flex-col gap-4">
        {rows.map((g) => {
          const target = g.questions * TARGET_MS_PER_QUESTION;
          const status = STATUS[paceStatus(g.ms, g.questions)];
          return (
            <li key={g.groupIndex}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-[15px] text-slate-900">
                <span>
                  <span className="font-semibold">{groupRange(test.groups[g.groupIndex])}</span>
                  <span className="text-slate-500"> · {TYPE_LABELS[g.type]}</span>
                </span>
                <span className="font-mono tabular-nums">
                  {formatDuration(g.ms)}
                  <span className="text-slate-400"> / {formatDuration(target)}</span>
                </span>
              </div>
              <div className="relative mt-1.5 h-2 rounded-full bg-slate-100" aria-hidden>
                <div className={`h-full rounded-full ${status.bar}`} style={{ width: `${(g.ms / scale) * 100}%` }} />
                <div className="absolute -top-1 h-4 w-0.5 bg-slate-400" style={{ left: `${(target / scale) * 100}%` }} />
              </div>
              <p className={`mt-1 text-xs font-medium ${status.text}`}>
                {status.label} · {minutesPerQuestion(g.ms, g.questions)} min per question
              </p>
            </li>
          );
        })}
      </ul>

      {outside >= 30_000 && (
        <p className="mt-4 text-sm text-slate-600">
          Before you started on a question (for example reading the passage first):{" "}
          <span className="font-mono tabular-nums">{formatDuration(outside)}</span>
        </p>
      )}

      {types.length > 1 && (
        <p className="mt-3 text-sm text-slate-600">
          By question type:{" "}
          {types.map((t, i) => (
            <span key={t.type}>
              {i > 0 && " · "}
              <span className={i === 0 ? "font-semibold text-slate-900" : undefined}>{TYPE_LABELS[t.type]}</span>{" "}
              {minutesPerQuestion(t.ms, t.questions)} min
            </span>
          ))}{" "}
          per question.
        </p>
      )}
    </section>
  );
}
