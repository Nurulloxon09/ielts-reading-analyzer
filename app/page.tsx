import Link from "next/link";
import ReplayBanner from "@/components/ReplayBanner";
import SavedCounts from "@/components/SavedCounts";
import { allNumbers } from "@/lib/test-schema";
import { listTests } from "@/lib/tests";

export default function Home() {
  const tests = listTests();

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-12">
      <p className="text-sm font-bold tracking-[0.14em] text-sky-700">IELTS READING</p>
      <h1 className="mt-1 text-3xl font-bold text-slate-900">Practice tests</h1>
      <p className="mt-2 text-[15px] text-slate-600">
        Solve a passage like in the real exam. After you submit, you&apos;ll see exactly why each answer was wrong.
      </p>
      <SavedCounts />
      <ReplayBanner />

      {tests.length === 0 ? (
        <p className="mt-10 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-slate-500">
          No tests yet.
        </p>
      ) : (
        <ul className="mt-8 flex flex-col gap-3">
          {tests.map((test) => (
            <li key={test.id}>
              <Link
                href={`/test/${test.id}`}
                className="group flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm transition hover:border-sky-400 hover:shadow"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sm font-bold text-sky-700">
                  P{test.passageNumber}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[17px] font-semibold text-slate-900">{test.title}</span>
                  <span className="mt-0.5 block text-sm text-slate-500">
                    {[test.source, `${allNumbers(test).length} questions`, `${test.minutes} min`]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="shrink-0 rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white group-hover:bg-sky-700">
                  Start
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
