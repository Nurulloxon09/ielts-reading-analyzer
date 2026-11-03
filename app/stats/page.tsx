import type { Metadata } from "next";
import Link from "next/link";
import StatsView from "@/components/StatsView";

export const metadata: Metadata = { title: "Stats · IELTS Reading" };

export default function StatsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-12">
      <Link href="/" className="text-sm font-semibold text-sky-700 hover:underline">
        ← All tests
      </Link>
      <h1 className="mt-3 text-3xl font-bold text-slate-900">Your stats</h1>
      <p className="mt-2 text-[15px] text-slate-600">What to practise next, from the tests you have done.</p>
      <StatsView />
    </main>
  );
}
