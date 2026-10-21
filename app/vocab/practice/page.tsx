import type { Metadata } from "next";
import Link from "next/link";
import VocabPractice from "@/components/VocabPractice";

export const metadata: Metadata = { title: "Use it in a sentence · IELTS Reading" };

export default function VocabPracticePage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-12">
      <Link href="/vocab" className="text-sm font-semibold text-sky-700 hover:underline">
        ← Vocabulary
      </Link>
      <h1 className="mt-3 text-3xl font-bold text-slate-900">Use it in a sentence</h1>
      <p className="mt-2 text-[15px] text-slate-600">
        Write your own sentence with the word. Using a word yourself is the best way to remember it.
      </p>
      <VocabPractice />
    </main>
  );
}
