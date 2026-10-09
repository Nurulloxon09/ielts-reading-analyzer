"use client";

import type { AnalysisResult } from "@/lib/storage";

const TRAP_LABELS: Record<string, string> = {
  distractor: "Distractor word",
  negative: "Missed a negative word",
  synonym: "Missed a paraphrase",
  not_given_logic: "FALSE vs NOT GIVEN",
  grammar: "Sentence structure",
  vocab: "Unknown word",
  other: "Other",
};

type Props = {
  result: AnalysisResult;
  paragraphLabel: string | null;
};

// The five parts of one mistake's explanation, in the order she should read them.
export default function AnalysisCard({ result, paragraphLabel }: Props) {
  const { analysis, evidence } = result;

  return (
    <div className="flex flex-col gap-5 pt-1">
      <Section title="Where the answer is">
        {evidence ? (
          <>
            <blockquote className="rounded-md border-l-4 border-amber-400 bg-amber-50 px-4 py-3 text-[15px] leading-relaxed text-slate-900">
              {evidence.quote}
            </blockquote>
            <p className="text-sm text-slate-500">
              {paragraphLabel ? `Paragraph ${paragraphLabel} · ` : ""}Highlighted in the passage.
            </p>
          </>
        ) : (
          <p className="text-[15px] text-slate-600">
            Couldn&apos;t find the exact sentence in the passage. The rest of the explanation is below.
          </p>
        )}
      </Section>

      {analysis.synonyms.length > 0 && (
        <Section title="Same meaning, different words">
          <div className="overflow-hidden rounded-md border border-slate-200">
            <div className="grid grid-cols-2 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span className="px-3 py-2">In the question</span>
              <span className="border-l border-slate-200 px-3 py-2">In the passage</span>
            </div>
            {analysis.synonyms.map((s, i) => (
              <div key={i} className="grid grid-cols-2 border-t border-slate-200 text-[15px]">
                <span className="px-3 py-2 text-slate-900">{s.questionPhrase}</span>
                <span className="border-l border-slate-200 px-3 py-2">
                  <span className="text-slate-900">{s.passagePhrase}</span>
                  {s.meaningUz && <span className="mt-0.5 block text-sm text-slate-500">{s.meaningUz}</span>}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Why your answer was wrong">
        <span className="self-start rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800">
          {TRAP_LABELS[analysis.trap.type] ?? analysis.trap.type}
        </span>
        <Bilingual en={analysis.trap.explanationEn} uz={analysis.trap.explanationUz} />
      </Section>

      {analysis.grammar && analysis.grammar.parts.length > 0 && (
        <Section title="Breaking down the sentence">
          <ol className="flex flex-col gap-2">
            {analysis.grammar.parts.map((part, i) => (
              <li key={i} className="rounded-md border border-slate-200 px-3 py-2">
                <p className="text-[15px] font-medium text-slate-900">{part.text}</p>
                <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-sky-700">{part.role}</p>
                {part.noteEn && <p className="mt-1 text-sm text-slate-600">{part.noteEn}</p>}
              </li>
            ))}
          </ol>
          <Bilingual en={analysis.grammar.ruleEn} uz={analysis.grammar.ruleUz} />
        </Section>
      )}

      {analysis.logic.length > 0 && (
        <Section title="How to get the answer">
          <ol className="flex flex-col gap-3">
            {analysis.logic.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                  {i + 1}
                </span>
                <Bilingual en={step.en} uz={step.uz} />
              </li>
            ))}
          </ol>
        </Section>
      )}

      {analysis.newVocab.length > 0 && (
        <Section title="New words">
          <ul className="flex flex-col divide-y divide-slate-200 rounded-md border border-slate-200">
            {analysis.newVocab.map((v, i) => (
              <li key={i} className="px-3 py-2 text-[15px]">
                <span className="font-semibold text-slate-900">{v.word}</span>
                <span className="text-slate-700"> — {v.meaningEn}</span>
                <span className="block text-sm text-slate-500">{v.meaningUz}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h4 className="text-sm font-bold uppercase tracking-wide text-slate-500">{title}</h4>
      {children}
    </section>
  );
}

export function Bilingual({ en, uz }: { en: string; uz: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[15px] leading-relaxed text-slate-900">{en}</p>
      {uz && (
        <p className="flex gap-2 text-[14px] leading-relaxed text-slate-500">
          <span className="mt-0.5 shrink-0 self-start rounded bg-slate-100 px-1 text-[10px] font-bold leading-4 text-slate-500">
            UZ
          </span>
          <span>{uz}</span>
        </p>
      )}
    </div>
  );
}
