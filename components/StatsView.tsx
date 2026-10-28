"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TRAP_LABELS } from "@/components/AnalysisCard";
import { getStats, type Stats } from "@/lib/db";
import { TYPE_LABELS, minutesPerQuestion, paceStatus } from "@/lib/pacing";

const PACE_TEXT = { ok: "text-emerald-700", slow: "text-amber-700", very_slow: "text-rose-700" } as const;

// One simple page of numbers from her saved attempts. No Gemini.
export default function StatsView() {
  const [stats, setStats] = useState<Stats | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    getStats().then((s) => {
      if (active) setStats(s);
    });
    return () => {
      active = false;
    };
  }, []);

  if (stats === undefined) return <p className="mt-8 text-slate-500">Loading…</p>;
  if (stats === null) return <p className="mt-8 text-slate-500">Your browser is not saving data, so there are no stats.</p>;

  const slowest = stats.pace[0];
  const topTraps = stats.traps.slice(0, 3);

  return (
    <div className="mt-8 flex flex-col gap-5">
      <Card title="Slowest question type">
        {slowest ? (
          <>
            <p className="text-[17px] text-slate-900">
              <span className="font-semibold">{TYPE_LABELS[slowest.type]}</span>:{" "}
              {minutesPerQuestion(slowest.ms, slowest.questions)} min per question
            </p>
            <ul className="mt-3 flex flex-col gap-1 text-sm">
              {stats.pace.map((p) => (
                <li key={p.type} className="flex justify-between gap-3">
                  <span className="text-slate-700">{TYPE_LABELS[p.type]}</span>
                  <span className={`font-mono tabular-nums ${PACE_TEXT[paceStatus(p.ms, p.questions)]}`}>
                    {minutesPerQuestion(p.ms, p.questions)} min
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-slate-500">
              Target: about 1 minute per question. From {stats.timedTests} timed {stats.timedTests === 1 ? "test" : "tests"}.
            </p>
          </>
        ) : (
          <Empty>Finish a test to see how long each question type takes you.</Empty>
        )}
      </Card>

      <Card title="Evidence for TRUE / FALSE / NOT GIVEN">
        {stats.evidence.total > 0 ? (
          <>
            <p className="text-[17px] text-slate-900">
              <span className="font-semibold">{Math.round((stats.evidence.right / stats.evidence.total) * 100)}%</span> right
              <span className="text-slate-500">
                {" "}
                ({stats.evidence.right} of {stats.evidence.total} questions)
              </span>
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Right means you highlighted the sentence that proves the answer, or correctly said there is none.
            </p>
          </>
        ) : (
          <Empty>Give evidence for TRUE / FALSE / NOT GIVEN questions in a test to see this.</Empty>
        )}
      </Card>

      <Card title="Top 3 mistake types">
        {topTraps.length > 0 ? (
          <ol className="flex flex-col gap-1.5 text-[15px]">
            {topTraps.map((t, i) => (
              <li key={t.trapType} className="flex justify-between gap-3">
                <span className="text-slate-900">
                  {i + 1}. {TRAP_LABELS[t.trapType] ?? t.trapType}
                </span>
                <span className="text-slate-500">
                  {t.count} {t.count === 1 ? "mistake" : "mistakes"}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <Empty>After a test, press &ldquo;Explain my mistakes&rdquo; to see your most common traps.</Empty>
        )}
      </Card>

      <Card title="Still failing in re-tries">
        {stats.stillFailing.length > 0 ? (
          <>
            <ul className="flex flex-col gap-1.5 text-[15px]">
              {stats.stillFailing.map((t) => (
                <li key={t.trapType} className="flex justify-between gap-3">
                  <span className="text-slate-900">{TRAP_LABELS[t.trapType] ?? t.trapType}</span>
                  <span className="text-slate-500">
                    {t.count} {t.count === 1 ? "question" : "questions"}
                  </span>
                </li>
              ))}
            </ul>
            <Link href="/replay" className="mt-3 inline-block text-sm font-semibold text-sky-700 hover:underline">
              Re-try old mistakes →
            </Link>
          </>
        ) : (
          <Empty>Nothing yet. Explained mistakes come back for a re-try after 3 days.</Empty>
        )}
      </Card>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white px-6 py-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[15px] text-slate-500">{children}</p>;
}
