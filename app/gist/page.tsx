import type { Metadata } from "next";
import Link from "next/link";
import { gistLabels } from "@/lib/gist";
import { listTests, toPublicTest } from "@/lib/tests";

export const metadata: Metadata = { title: "Paragraph main ideas · IELTS Reading" };

export default function GistListPage() {
  const tests = listTests()
    .map((t) => ({ id: t.id, title: t.title, passageNumber: t.passageNumber, paragraphs: gistLabels(toPublicTest(t)).length }))
    .filter((t) => t.paragraphs >= 2)
    .sort((a, b) => a.passageNumber - b.passageNumber || a.title.localeCompare(b.title));

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-12">
      <Link href="/" className="text-sm font-semibold text-sky-700 hover:underline">
        ← All tests
      </Link>
      <h1 className="mt-3 text-3xl font-bold text-slate-900">Paragraph main ideas</h1>
      <p className="mt-2 text-[15px] text-slate-600">
        Practice for matching headings. Pick a passage and write one short line with the main idea of each paragraph.
        The AI tells you if you caught the idea or only a keyword.
      </p>
      <ul className="mt-8 flex flex-col gap-3">
        {tests.map((t) => (
          <li key={t.id}>
            <Link
              href={`/gist/${t.id}`}
              className="group flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm transition hover:border-sky-400 hover:shadow"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sm font-bold text-sky-700">
                P{t.passageNumber}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[17px] font-semibold text-slate-900">{t.title}</span>
                <span className="mt-0.5 block text-sm text-slate-500">{t.paragraphs} paragraphs</span>
              </span>
              <span className="shrink-0 rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white group-hover:bg-sky-700">
                Start
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
