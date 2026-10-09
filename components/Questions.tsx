"use client";

import type { PublicTest, QuestionGroup } from "@/lib/test-schema";
import { TFNG_OPTIONS, YNNG_OPTIONS } from "@/lib/test-schema";
import { gapLineKind, groupRange } from "@/lib/test-text";

type AnswerProps = {
  answers: Record<string, string>;
  onAnswer: (n: number, value: string) => void;
};

export default function Questions({ test, answers, onAnswer }: { test: PublicTest } & AnswerProps) {
  return (
    <div className="mx-auto flex max-w-[46rem] flex-col gap-8 px-6 py-6 md:px-8">
      <h2 className="text-center text-2xl font-bold text-slate-900">Questions</h2>
      {test.groups.map((group, i) => (
        <section key={i} className="flex flex-col gap-3">
          <Instructions group={group} />
          <GroupBody group={group} answers={answers} onAnswer={onAnswer} />
        </section>
      ))}
    </div>
  );
}

function Instructions({ group }: { group: QuestionGroup }) {
  const [first, ...rest] = group.instructions.split("\n");
  return (
    <div className="rounded-r-lg border-l-4 border-sky-600 bg-sky-50 px-5 py-4 text-[15px] leading-relaxed text-slate-800">
      <p className="font-bold text-slate-900">{groupRange(group)}</p>
      <p>{first}</p>
      {rest.map((line, i) => (
        <p key={i} className={isAnswerWord(line) ? "font-semibold" : undefined}>
          {line}
        </p>
      ))}
    </div>
  );
}

// "TRUE if the statement…" lines read best in bold, like the paper test.
function isAnswerWord(line: string) {
  return /^(TRUE|FALSE|NOT GIVEN|YES|NO)\b/.test(line) || /ONE WORD|NO MORE THAN|NUMBER/.test(line);
}

function GroupBody({ group, answers, onAnswer }: { group: QuestionGroup } & AnswerProps) {
  switch (group.type) {
    case "tfng":
    case "ynng": {
      const options = group.type === "tfng" ? TFNG_OPTIONS : YNNG_OPTIONS;
      return (
        <div className="flex flex-col gap-3">
          {group.questions.map((q) => (
            <Card key={q.n} n={q.n}>
              <QuestionText n={q.n} text={q.text} />
              <Choices
                n={q.n}
                value={answers[q.n] ?? ""}
                onChange={(v) => onAnswer(q.n, v)}
                options={options.map((o) => ({ value: o, label: o }))}
              />
            </Card>
          ))}
        </div>
      );
    }
    case "mcq":
      return (
        <div className="flex flex-col gap-3">
          {group.questions.map((q) => (
            <Card key={q.n} n={q.n}>
              <QuestionText n={q.n} text={q.text} />
              <Choices
                n={q.n}
                value={answers[q.n] ?? ""}
                onChange={(v) => onAnswer(q.n, v)}
                options={q.options.map((o) => ({ value: o.key, label: o.text, key: o.key }))}
              />
            </Card>
          ))}
        </div>
      );
    case "matching": {
      const hasText = group.options.some((o) => o.text);
      return (
        <div className="flex flex-col gap-3">
          {hasText && (
            <div className="rounded-lg border border-slate-200 bg-white px-5 py-4">
              {group.optionsTitle && <p className="mb-2 font-bold text-slate-900">{group.optionsTitle}</p>}
              <ul className="flex flex-col gap-1.5 text-[15px] text-slate-800">
                {group.options.map((o) => (
                  <li key={o.key} className="flex gap-3">
                    <span className="w-8 shrink-0 font-bold">{o.key}</span>
                    <span>{o.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-col divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {group.questions.map((q) => (
              <div
                key={q.n}
                id={`q-${q.n}`}
                className="flex scroll-mt-4 flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <QuestionText n={q.n} text={q.text} />
                <select
                  value={answers[q.n] ?? ""}
                  onChange={(e) => onAnswer(q.n, e.target.value)}
                  aria-label={`Answer for question ${q.n}`}
                  className="h-10 w-28 rounded-md border border-slate-300 bg-white px-2 text-[15px] font-semibold text-slate-900 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-200"
                >
                  <option value="">Choose</option>
                  {group.options.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.key}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      );
    }
    case "gap":
      return (
        <div className="rounded-lg border border-slate-200 bg-white px-5 py-4">
          {group.title && <p className="mb-3 text-center text-lg font-bold text-slate-900">{group.title}</p>}
          <div className="flex flex-col gap-3 text-[16px] leading-[2.4] text-slate-800">
            {group.lines.map((line, i) => {
              const { kind, text } = gapLineKind(line);
              if (kind === "heading") {
                return (
                  <p key={i} className="mt-1 font-bold leading-normal text-slate-900">
                    {text}
                  </p>
                );
              }
              return (
                <p key={i} className={kind === "bullet" ? "flex gap-2 pl-1" : undefined}>
                  {kind === "bullet" && <span aria-hidden>•</span>}
                  <span>
                    <GapLine text={text} answers={answers} onAnswer={onAnswer} />
                  </span>
                </p>
              );
            })}
          </div>
        </div>
      );
  }
}

function GapLine({ text, answers, onAnswer }: { text: string } & AnswerProps) {
  const parts = text.split(/(\{\{\d+\}\})/);
  return (
    <>
      {parts.map((part, i) => {
        const m = /^\{\{(\d+)\}\}$/.exec(part);
        if (!m) return <span key={i}>{part}</span>;
        const n = Number(m[1]);
        return (
          <span key={i} id={`q-${n}`} className="mx-1 inline-flex scroll-mt-4 items-center gap-1.5 align-middle">
            <span className="text-[15px] font-bold text-slate-900">{n}</span>
            <input
              value={answers[n] ?? ""}
              onChange={(e) => onAnswer(n, e.target.value)}
              aria-label={`Answer for question ${n}`}
              autoComplete="off"
              spellCheck={false}
              maxLength={60}
              className="h-9 w-40 rounded-md border border-slate-300 bg-white px-2.5 text-[15px] leading-normal text-slate-900 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-200"
            />
          </span>
        );
      })}
    </>
  );
}

function Card({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div id={`q-${n}`} className="flex scroll-mt-4 flex-col gap-3 rounded-lg border border-slate-200 bg-white px-5 py-4">
      {children}
    </div>
  );
}

function QuestionText({ n, text }: { n: number; text: string }) {
  return (
    <p className="text-[16px] leading-relaxed text-slate-900">
      <span className="font-bold">{n}.</span> {text}
    </p>
  );
}

function Choices({
  n,
  value,
  onChange,
  options,
}: {
  n: number;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; key?: string }[];
}) {
  return (
    <div role="radiogroup" aria-label={`Answer for question ${n}`} className="flex flex-col gap-1">
      {options.map((o) => {
        const checked = value === o.value;
        return (
          <label
            key={o.value}
            className={`flex cursor-pointer items-start gap-3 rounded-md px-3 py-2 text-[15px] transition-colors ${
              checked ? "bg-sky-50 text-slate-900 ring-1 ring-sky-300" : "text-slate-800 hover:bg-slate-50"
            }`}
          >
            <input
              type="radio"
              name={`q${n}`}
              value={o.value}
              checked={checked}
              onChange={() => onChange(o.value)}
              className="mt-[3px] size-4 shrink-0 accent-sky-600"
            />
            {o.key ? (
              <span>
                <span className="mr-2 font-bold">{o.key}</span>
                {o.label}
              </span>
            ) : (
              <span className="font-medium">{o.label}</span>
            )}
          </label>
        );
      })}
    </div>
  );
}
