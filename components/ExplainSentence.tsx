"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bilingual, Section } from "@/components/AnalysisCard";
import { getCachedExplanation, saveExplanation } from "@/lib/db";
import type { ExplainResponse, Explanation } from "@/lib/schema";

type Props = {
  testId: string;
  enabled: boolean;
  children: React.ReactNode;
};

type Panel =
  | { state: "loading"; text: string }
  | { state: "done"; text: string; explanation: Explanation }
  | { state: "error"; text: string; error: string };

const MIN_CHARS = 2;
const MAX_CHARS = 600;

// Wraps the passage. After submit, selecting text shows an "Explain" button;
// clicking it opens a breakdown. Explanations are cached in IndexedDB to save Gemini calls.
export default function ExplainSentence({ testId, enabled, children }: Props) {
  const area = useRef<HTMLDivElement>(null);
  const [button, setButton] = useState<{ text: string; top: number; left: number } | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const closePanel = useCallback(() => setPanel(null), []);

  const updateButton = useCallback(() => {
    const selection = window.getSelection();
    const text = selection?.toString().trim() ?? "";
    if (
      !enabled ||
      !selection ||
      selection.rangeCount === 0 ||
      text.length < MIN_CHARS ||
      text.length > MAX_CHARS ||
      !area.current?.contains(selection.getRangeAt(0).commonAncestorContainer)
    ) {
      setButton(null);
      return;
    }
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    setButton({ text, top: rect.bottom + 8, left: Math.min(rect.left, window.innerWidth - 120) });
  }, [enabled]);

  useEffect(() => {
    document.addEventListener("selectionchange", updateButton);
    window.addEventListener("scroll", updateButton, true);
    window.addEventListener("resize", updateButton);
    return () => {
      document.removeEventListener("selectionchange", updateButton);
      window.removeEventListener("scroll", updateButton, true);
      window.removeEventListener("resize", updateButton);
    };
  }, [updateButton]);

  async function explain(text: string) {
    setButton(null);
    window.getSelection()?.removeAllRanges();
    setPanel({ state: "loading", text });

    const cached = await getCachedExplanation(testId, text);
    if (cached) {
      setPanel({ state: "done", text, explanation: cached });
      return;
    }

    let data: ExplainResponse;
    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testId, text }),
      });
      data = await res.json();
    } catch {
      data = { ok: false, error: "Could not reach the server." };
    }
    // Ignore a late answer if she already closed the panel or picked other text.
    setPanel((current) => {
      if (current?.text !== text) return current;
      return data.ok
        ? { state: "done", text: data.text, explanation: data.explanation }
        : { state: "error", text, error: data.error };
    });
    if (data.ok) void saveExplanation(testId, text, data.explanation);
  }

  return (
    <div ref={area}>
      {children}

      {button && (
        <button
          type="button"
          // Keep the selection: don't let the mousedown clear it before the click.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => explain(button.text)}
          style={{ top: button.top, left: button.left }}
          className="fixed z-20 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white shadow-lg hover:bg-slate-700"
        >
          Explain this
        </button>
      )}

      {panel && <ExplanationDialog panel={panel} onClose={closePanel} onRetry={() => explain(panel.text)} />}
    </div>
  );
}

function ExplanationDialog({ panel, onClose, onRetry }: { panel: Panel; onClose: () => void; onRetry: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-slate-900/30 p-4 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Sentence explanation"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
      >
        <div className="flex items-start gap-3 border-b border-slate-200 px-5 py-4">
          <blockquote className="min-w-0 flex-1 border-l-4 border-sky-500 pl-3 text-[15px] leading-relaxed text-slate-900">
            {panel.text}
          </blockquote>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-md px-2 py-1 text-lg leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            ×
          </button>
        </div>

        <div className="flex flex-col gap-5 overflow-y-auto px-5 py-5">
          {panel.state === "loading" && <p className="text-[15px] text-slate-600">Explaining…</p>}

          {panel.state === "error" && (
            <div className="flex flex-wrap items-center gap-3">
              <p role="alert" className="text-[15px] text-rose-700">
                {panel.error}
              </p>
              <button
                type="button"
                onClick={onRetry}
                className="rounded-md border border-sky-600 px-3 py-1.5 text-sm font-semibold text-sky-700 hover:bg-sky-50"
              >
                Try again
              </button>
            </div>
          )}

          {panel.state === "done" && <ExplanationBody explanation={panel.explanation} />}
        </div>
      </div>
    </div>
  );
}

function ExplanationBody({ explanation }: { explanation: Explanation }) {
  return (
    <>
      <Section title="What it means">
        <Bilingual en={explanation.meaningEn} uz={explanation.meaningUz} />
      </Section>

      {explanation.parts.length > 0 && (
        <Section title="Parts of the sentence">
          <ol className="flex flex-col gap-2">
            {explanation.parts.map((part, i) => (
              <li key={i} className="rounded-md border border-slate-200 px-3 py-2">
                <p className="text-[15px] font-medium text-slate-900">{part.text}</p>
                <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-sky-700">{part.role}</p>
                {part.noteEn && <p className="mt-1 text-sm text-slate-600">{part.noteEn}</p>}
              </li>
            ))}
          </ol>
        </Section>
      )}

      {explanation.grammarEn && (
        <Section title="Grammar">
          <Bilingual en={explanation.grammarEn} uz={explanation.grammarUz} />
        </Section>
      )}

      {explanation.vocab.length > 0 && (
        <Section title="Words">
          <ul className="flex flex-col divide-y divide-slate-200 rounded-md border border-slate-200">
            {explanation.vocab.map((v, i) => (
              <li key={i} className="px-3 py-2 text-[15px]">
                <span className="font-semibold text-slate-900">{v.word}</span>
                <span className="text-slate-700"> — {v.meaningEn}</span>
                <span className="block text-sm text-slate-500">{v.meaningUz}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
