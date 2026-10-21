"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getCounts } from "@/lib/db";

// Shows how much is saved in the mistake log. Hidden until something is saved.
export default function SavedCounts() {
  const [counts, setCounts] = useState<{ mistakes: number; words: number } | null>(null);

  useEffect(() => {
    let active = true;
    getCounts().then((c) => {
      if (active) setCounts(c);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!counts || (counts.mistakes === 0 && counts.words === 0)) return null;
  return (
    <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
      <span>
        Saved so far: <span className="font-semibold text-slate-900">{counts.mistakes}</span>{" "}
        {counts.mistakes === 1 ? "mistake" : "mistakes"} ·{" "}
        <span className="font-semibold text-slate-900">{counts.words}</span> new {counts.words === 1 ? "word" : "words"}
      </span>
      {counts.words > 0 && (
        <Link href="/vocab" className="font-semibold text-sky-700 hover:underline">
          Open vocabulary →
        </Link>
      )}
    </p>
  );
}
