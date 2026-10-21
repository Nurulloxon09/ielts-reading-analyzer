import type { Metadata } from "next";
import Link from "next/link";
import VocabBank from "@/components/VocabBank";
import { listTests } from "@/lib/tests";

export const metadata: Metadata = { title: "Vocabulary · IELTS Reading" };

export default function VocabPage() {
  // Only id and title go to the browser, to show "From: <test>" on each word.
  const tests = listTests().map((t) => ({ id: t.id, title: t.title }));

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-12">
      <Link href="/" className="text-sm font-semibold text-sky-700 hover:underline">
        ← All tests
      </Link>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold text-slate-900">Vocabulary</h1>
        <Link
          href="/vocab/practice"
          className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700"
        >
          Practise: use in a sentence
        </Link>
      </div>
      <p className="mt-2 text-[15px] text-slate-600">
        Every word you saved: from explained mistakes, explained sentences and &ldquo;Add to vocabulary&rdquo;.
      </p>
      <VocabBank tests={tests} />
    </main>
  );
}
