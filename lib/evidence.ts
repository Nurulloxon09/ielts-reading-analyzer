// Finds the model's evidence quote in the passage. The returned quote is
// sliced from the passage itself, so what we show is always verbatim.

export type EvidenceMatch = { quote: string; start: number; end: number };

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findEvidence(passage: string, quote: string): EvidenceMatch | null {
  const trimmed = quote.trim();
  if (trimmed === "") return null;

  const exact = passage.indexOf(trimmed);
  if (exact !== -1) {
    return { quote: trimmed, start: exact, end: exact + trimmed.length };
  }

  // Same words in the same order; only line breaks and spacing may differ
  // (pasted passages often wrap lines in the middle of a sentence).
  const words = trimmed.split(/\s+/).map(escapeRegExp);
  const match = new RegExp(words.join("\\s+")).exec(passage);
  if (!match) return null;
  return { quote: match[0], start: match.index, end: match.index + match[0].length };
}
