import ReplayBanner from "@/components/ReplayBanner";
import SavedCounts from "@/components/SavedCounts";
import TestList, { type TestSummary } from "@/components/TestList";
import { allNumbers } from "@/lib/test-schema";
import { listTests } from "@/lib/tests";

export default function Home() {
  // Only what the cards show: no answer key, and the source stays in the test file.
  const tests: TestSummary[] = listTests().map((t) => ({
    id: t.id,
    title: t.title,
    passageNumber: t.passageNumber,
    questions: allNumbers(t).length,
    minutes: t.minutes,
  }));

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-12">
      <p className="text-sm font-bold tracking-[0.14em] text-sky-700">IELTS READING</p>
      <h1 className="mt-1 text-3xl font-bold text-slate-900">Practice tests</h1>
      <p className="mt-2 text-[15px] text-slate-600">
        Solve a passage like in the real exam. After you submit, you&apos;ll see exactly why each answer was wrong.
      </p>
      <SavedCounts />
      <ReplayBanner />
      <TestList tests={tests} />
    </main>
  );
}
