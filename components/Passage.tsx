"use client";

import { useEffect, useRef } from "react";
import type { PublicTest } from "@/lib/test-schema";
import { allNumbers } from "@/lib/test-schema";

export type Highlight = { paragraph: number; start: number; end: number };

type Props = {
  test: PublicTest;
  highlight?: Highlight | null;
};

export default function Passage({ test, highlight }: Props) {
  const markRef = useRef<HTMLElement>(null);
  const nums = allNumbers(test);
  const first = Math.min(...nums);
  const last = Math.max(...nums);
  const hasLabels = test.passage.paragraphs.some((p) => p.label);

  useEffect(() => {
    markRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlight]);

  return (
    <article className="mx-auto max-w-[46rem] px-6 py-6 md:px-10">
      <div className="rounded-lg bg-sky-600 px-6 py-4 text-center text-white shadow-sm">
        <p className="text-sm font-bold tracking-[0.12em]">READING PASSAGE {test.passageNumber}</p>
        <p className="mt-1 text-sm italic text-sky-50">
          You should spend about {test.minutes} minutes on Questions {first}–{last}, which are based on
          Reading Passage {test.passageNumber} below.
        </p>
      </div>

      <h1 className="mt-8 text-center text-3xl font-bold text-slate-900">{test.passage.title}</h1>
      {test.passage.subtitle && (
        <p className="mt-2 text-center italic text-slate-600">{test.passage.subtitle}</p>
      )}

      <div className="mt-8 flex flex-col gap-6">
        {test.passage.paragraphs.map((p, i) => {
          const hl = highlight && highlight.paragraph === i ? highlight : null;
          return (
            <div key={i} className="flex gap-4">
              {hasLabels && <span className="w-5 shrink-0 pt-px text-lg font-bold text-slate-900">{p.label}</span>}
              <p className="text-justify text-[17px] leading-[1.85] text-slate-800 hyphens-auto">
                {hl ? (
                  <>
                    {p.text.slice(0, hl.start)}
                    <mark ref={markRef} className="rounded bg-amber-200 px-0.5 text-slate-900 ring-2 ring-amber-300">
                      {p.text.slice(hl.start, hl.end)}
                    </mark>
                    {p.text.slice(hl.end)}
                  </>
                ) : (
                  p.text
                )}
              </p>
            </div>
          );
        })}
      </div>
    </article>
  );
}
