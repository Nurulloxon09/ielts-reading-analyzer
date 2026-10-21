import type { Metadata } from "next";
import Link from "next/link";
import VocabBank from "@/components/VocabBank";
import { listTests } from "@/lib/tests";

export const metadata: Metadata = { title: "Vocabulary · IELTS Reading" };

export default function VocabPage() {
  // Only ids and titles go to the browser, for the test links and filter.
  const tests = listTests().map((test) => ({ id: test.id, title: test.title }));

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-12">
      <Link href="/" className="text-sm font-medium text-slate-600 hover:text-slate-900">
        ← All tests
      </Link>
      <p className="mt-6 text-sm font-bold tracking-[0.14em] text-sky-700">IELTS READING</p>
      <h1 className="mt-1 text-3xl font-bold text-slate-900">Vocabulary</h1>
      <p className="mt-2 text-[15px] text-slate-600">Every word you saved, with its meaning and the test it came from.</p>
      <VocabBank tests={tests} />
    </main>
  );
}
