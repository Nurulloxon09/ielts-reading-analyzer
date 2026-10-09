"use client";

import { useRef, useState } from "react";
import AnalyzeMistakes from "@/components/AnalyzeMistakes";
import { checkAnswers, type AnswerRow, type CheckedAnswer } from "@/lib/answers";

const DEFAULT_ROW_COUNT = 13;

function makeRows(count: number): AnswerRow[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `row-${i + 1}`,
    number: String(i + 1),
    given: "",
    correct: "",
  }));
}

function validate(passage: string, questions: string, rows: AnswerRow[]): string[] {
  const errors: string[] = [];
  if (passage.trim() === "") errors.push("Paste the passage.");
  if (questions.trim() === "") errors.push("Paste the questions.");

  const filled = rows.filter((row) => row.correct.trim() !== "");
  if (filled.length === 0) errors.push("Add at least one correct answer.");

  const seen = new Set<string>();
  for (const row of filled) {
    const n = row.number.trim();
    if (!/^\d+$/.test(n) || Number(n) < 1) {
      errors.push(`"${n || "(empty)"}" is not a valid question number.`);
    } else if (seen.has(n)) {
      errors.push(`Question ${n} is in the table twice.`);
    }
    seen.add(n);
  }
  return errors;
}

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

export default function InputForm() {
  const [passage, setPassage] = useState("");
  const [questions, setQuestions] = useState("");
  const [rows, setRows] = useState<AnswerRow[]>(() => makeRows(DEFAULT_ROW_COUNT));
  const [errors, setErrors] = useState<string[]>([]);
  const [results, setResults] = useState<CheckedAnswer[] | null>(null);
  const nextId = useRef(DEFAULT_ROW_COUNT + 1);

  function updateRow(id: string, field: "number" | "given" | "correct", value: string) {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
    setResults(null);
  }

  function addRow() {
    setRows((prev) => {
      const last = Number(prev.at(-1)?.number);
      const number = Number.isInteger(last) ? String(last + 1) : "";
      return [...prev, { id: `row-${nextId.current++}`, number, given: "", correct: "" }];
    });
    setResults(null);
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((row) => row.id !== id));
    setResults(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const found = validate(passage, questions, rows);
    setErrors(found);
    setResults(found.length === 0 ? checkAnswers(rows) : null);
  }

  const wrong = results?.filter((r) => !r.isCorrect) ?? [];

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <label className="flex flex-col gap-2">
        <span className="font-medium">Passage</span>
        <textarea
          value={passage}
          onChange={(e) => {
            setPassage(e.target.value);
            setResults(null);
          }}
          rows={14}
          placeholder="Paste the reading passage here."
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="font-medium">Questions</span>
        <textarea
          value={questions}
          onChange={(e) => {
            setQuestions(e.target.value);
            setResults(null);
          }}
          rows={8}
          placeholder="Paste the questions here, with their numbers."
          className={inputClass}
        />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-medium">Answers</legend>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Rows without a correct answer are skipped. Leave your answer empty if you skipped the
          question.
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-zinc-600 dark:text-zinc-400">
              <th className="w-20 py-1 pr-2 font-medium">No.</th>
              <th className="py-1 pr-2 font-medium">Your answer</th>
              <th className="py-1 pr-2 font-medium">Correct answer</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="py-1 pr-2">
                  <input
                    value={row.number}
                    onChange={(e) => updateRow(row.id, "number", e.target.value)}
                    inputMode="numeric"
                    aria-label="Question number"
                    className={inputClass}
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    value={row.given}
                    onChange={(e) => updateRow(row.id, "given", e.target.value)}
                    aria-label={`Your answer for question ${row.number}`}
                    className={inputClass}
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    value={row.correct}
                    onChange={(e) => updateRow(row.id, "correct", e.target.value)}
                    aria-label={`Correct answer for question ${row.number}`}
                    className={inputClass}
                  />
                </td>
                <td className="py-1 text-right">
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    aria-label={`Remove question ${row.number}`}
                    className="rounded px-2 py-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          type="button"
          onClick={addRow}
          className="self-start rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          + Add row
        </button>
      </fieldset>

      {errors.length > 0 && (
        <ul
          role="alert"
          className="list-disc rounded-md border border-red-300 bg-red-50 py-3 pl-8 pr-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {errors.map((error, i) => (
            <li key={i}>{error}</li>
          ))}
        </ul>
      )}

      <button
        type="submit"
        className="self-start rounded-md bg-zinc-900 px-5 py-2.5 font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        Check answers
      </button>

      {results && (
        <section
          aria-live="polite"
          className="flex flex-col gap-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-800"
        >
          <p className="font-medium">
            {results.length - wrong.length} / {results.length} correct
          </p>
          {wrong.length === 0 ? (
            <p className="text-sm">No mistakes. Well done!</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {wrong.map((r) => (
                <li key={r.number}>
                  <span className="font-medium">Q{r.number}:</span> your answer{" "}
                  <span className="text-red-700 dark:text-red-400">{r.given || "(empty)"}</span> ·
                  correct <span className="text-green-700 dark:text-green-400">{r.correct}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {results && wrong.length > 0 && (
        <AnalyzeMistakes passage={passage} questions={questions} mistakes={wrong} />
      )}
    </form>
  );
}
