"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getReplayStats } from "@/lib/db";

const DAY = 24 * 60 * 60 * 1000;

type Shown = { due: number } | { nextInDays: number } | null;

// Home page: how many old mistakes are due for a re-try. Hidden until a mistake is saved.
export default function ReplayBanner() {
  const [shown, setShown] = useState<Shown>(null);

  useEffect(() => {
    let active = true;
    getReplayStats().then((s) => {
      if (!active || !s || s.active === 0) return;
      if (s.due > 0) setShown({ due: s.due });
      else if (s.nextDueAt) setShown({ nextInDays: Math.max(1, Math.ceil((s.nextDueAt - Date.now()) / DAY)) });
    });
    return () => {
      active = false;
    };
  }, []);

  if (!shown) return null;

  if ("nextInDays" in shown) {
    return (
      <p className="mt-2 text-sm text-slate-500">
        Next mistake re-try: {shown.nextInDays === 1 ? "tomorrow" : `in ${shown.nextInDays} days`}.
      </p>
    );
  }

  return (
    <Link
      href="/replay"
      className="group mt-6 flex items-center gap-4 rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 shadow-sm transition hover:border-amber-400 hover:shadow"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-xl" aria-hidden>
        ↻
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[17px] font-semibold text-slate-900">
          {shown.due} {shown.due === 1 ? "question" : "questions"} to re-try
        </span>
        <span className="mt-0.5 block text-sm text-slate-600">Mistakes from earlier tests. Can you get them right now?</span>
      </span>
      <span className="shrink-0 rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-white group-hover:bg-amber-600">
        Start
      </span>
    </Link>
  );
}
