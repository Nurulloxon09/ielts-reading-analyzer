"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import Passage, { type Highlight } from "@/components/Passage";
import { getGistCheck, saveGistCheck } from "@/lib/db";
import type { CompareList } from "@/lib/gist";
import type { GistCheck, GistCheckResponse } from "@/lib/schema";
import type { PublicTest } from "@/lib/test-schema";

type Status = { state: "idle" } | { state: "checking" } | { state: "error"; error: string };
type Checked = { lines: Record<string, string>; check: GistCheck };

const clean = (line: string) => line.trim().replace(/\s+/g, " ");

// Paragraph gist drill (matching headings practice): one line per paragraph, checked together in
// one Gemini call and cached in IndexedDB. Afterwards the test's own headings list is shown next
// to her lines, without the answers.
export default function GistDrill({
  test,
  labels,
  compare,
}: {
  test: PublicTest;
  labels: string[];
  compare: CompareList[];
}) {
  const [lines, setLines] = useState<Record<string, string>>({});
  const [focused, setFocused] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const [checked, setChecked] = useState<Checked | null>(null);

  // The paragraph she is writing about is highlighted in the passage.
  const highlight: Highlight | null = useMemo(() => {
    const i = test.passage.paragraphs.findIndex((p) => p.label === focused);
    return i === -1 ? null : { paragraph: i, start: 0, end: test.passage.paragraphs[i].text.length };
  }, [focused, test]);

  const current = Object.fromEntries(labels.map((l) => [l, clean(lines[l] ?? "")]));
  const unchanged = checked !== null && labels.every((l) => checked.lines[l] === current[l]);
  const results = new Map(checked?.check.paragraphs.map((p) => [p.label, p]));
  const caught = checked ? checked.check.paragraphs.filter((p) => p.captured).length : 0;

  async function check() {
    const missing = labels.filter((l) => current[l].length < 2);
    if (missing.length > 0) {
      setStatus({ state: "error", error: `Write a line for paragraph ${missing.join(", ")}.` });
      return;
    }
    setStatus({ state: "checking" });
    const cached = await getGistCheck(test.id, current);
    if (cached) {
      setChecked({ lines: current, check: cached });
      setStatus({ state: "idle" });
      return;
    }
    let data: GistCheckResponse;
    try {
      const res = await fetch("/api/gist/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testId: test.id, summaries: current }),
      });
      data = await res.json();
    } catch {
      data = { ok: false, error: "Could not reach the server." };
    }
    if (!data.ok) {
      setStatus({ state: "error", error: data.error });
      return;
    }
    void saveGistCheck(test.id, current, data.check);
    setChecked({ lines: current, check: data.check });
    setStatus({ state: "idle" });
  }

  return (
    <div className="flex h-dvh flex-col bg-slate-100 text-slate-900">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-4">
        <Link href="/gist" className="shrink-0 rounded-md px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900">
          ← All passages
        </Link>
        <p className="min-w-0 flex-1 truncate text-[15px] font-semibold">Main ideas: {test.title}</p>
        {checked && (
          <p className="shrink-0 text-sm text-slate-600">
            <span className="font-semibold text-emerald-700">{caught}</span> of {checked.check.paragraphs.length} caught
          </p>
        )}
      </header>

      <main className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-2 md:overflow-hidden">
        <div className="border-slate-200 bg-white md:overflow-y-auto md:border-r">
          <Passage test={test} highlight={highlight} />
        </div>

        <div className="bg-slate-50 md:overflow-y-auto">
          <div className="mx-auto flex max-w-[40rem] flex-col gap-4 px-6 py-6 md:px-8">
            <section className="rounded-xl border border-slate-200 bg-white px-5 py-4 text-[15px] text-slate-700">
              Write the main idea of each paragraph in <span className="font-semibold">one short line</span>, in your own
              words. Think about what the <span className="font-semibold">whole</span> paragraph is about, not one word or
              example in it.
            </section>

            <ol className="flex flex-col gap-3">
              {labels.map((label) => {
                const result = results.get(label);
                const showResult = result && checked?.lines[label] === current[label];
                return (
                  <li key={label} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <label className="flex items-center gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sky-50 font-bold text-sky-700">
                        {label}
                      </span>
                      <input
                        value={lines[label] ?? ""}
                        onChange={(e) => setLines((prev) => ({ ...prev, [label]: e.target.value }))}
                        onFocus={() => setFocused(label)}
                        maxLength={200}
                        placeholder={`Main idea of paragraph ${label}`}
                        aria-label={`Main idea of paragraph ${label}`}
                        className="h-10 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 text-[15px] text-slate-900 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-200"
                      />
                    </label>
                    {showResult ? (
                      <div className="mt-3 flex flex-col gap-1 pl-11 text-sm">
                        <p className={`font-semibold ${result.captured ? "text-emerald-700" : "text-rose-700"}`}>
                          {result.captured ? "✓ You caught the main idea." : "✗ Not the main idea yet."}
                        </p>
                        <p className="text-slate-800">
                          <span className="font-semibold">Main idea:</span> {result.mainIdea}
                        </p>
                        <p className="text-slate-700">{result.feedbackEn}</p>
                        <p className="text-slate-500">{result.feedbackUz}</p>
                        {result.keywordTrap && (
                          <p className="text-amber-800">
                            <span className="font-semibold">Keyword trap:</span> you used <q>{result.keywordTrap}</q> from
                            the paragraph instead of its idea.
                          </p>
                        )}
                      </div>
                    ) : (
                      result && <p className="mt-2 pl-11 text-sm text-slate-500">Changed. Press &ldquo;Check again&rdquo;.</p>
                    )}
                  </li>
                );
              })}
            </ol>

            {status.state === "error" && (
              <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                {status.error}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={check}
                disabled={status.state === "checking" || unchanged}
                className="rounded-md bg-sky-600 px-5 py-2.5 text-[15px] font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-50"
              >
                {status.state === "checking" ? "Checking…" : checked ? "Check again" : "Check my main ideas"}
              </button>
              {checked && (
                <p className="text-sm text-slate-600">
                  You caught {caught} of {checked.check.paragraphs.length} main ideas.
                </p>
              )}
            </div>

            {checked &&
              compare.map((list) => (
                <section key={list.title} className="rounded-xl border border-slate-200 bg-white px-5 py-4">
                  <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Compare with the test</p>
                  <p className="mt-1 font-semibold text-slate-900">{list.title}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    Which one fits each paragraph? Use your own lines to decide. The answers are in the test itself.
                  </p>
                  <ul className="mt-3 flex flex-col gap-1.5 text-[15px] text-slate-800">
                    {list.items.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </section>
              ))}
          </div>
        </div>
      </main>
    </div>
  );
}
