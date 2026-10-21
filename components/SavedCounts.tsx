"use client";

import { useEffect, useState } from "react";
import { db, safely } from "@/lib/db";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// How much she has saved so far. Read from IndexedDB after the page loads.
export default function SavedCounts() {
  const [counts, setCounts] = useState<{ mistakes: number; words: number } | null>(null);

  useEffect(() => {
    let active = true;
    void safely(async () => ({ mistakes: await db.mistakes.count(), words: await db.vocab.count() }), null).then(
      (c) => {
        if (active) setCounts(c);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  if (!counts) return null;
  return (
    <p className="text-sm text-slate-600">
      Saved: {plural(counts.mistakes, "mistake")} · {plural(counts.words, "word")}
    </p>
  );
}
