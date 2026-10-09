// Finds the model's evidence quote in the passage. The returned quote is
// sliced from the passage itself, so what we show is always verbatim.

export type EvidenceMatch = {
  quote: string;
  paragraph: number; // index into passage.paragraphs
  start: number; // character offsets inside that paragraph
  end: number;
};

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Curly and straight quotes/apostrophes/dashes count as the same character.
const LOOSE: Record<string, string> = {
  "'": "['‘’]",
  "‘": "['‘’]",
  "’": "['‘’]",
  '"': '["“”]',
  "“": '["“”]',
  "”": '["“”]',
  "-": "[-–—]",
  "–": "[-–—]",
  "—": "[-–—]",
};

function wordPattern(word: string): string {
  return [...word].map((ch) => LOOSE[ch] ?? escapeRegExp(ch)).join("");
}

function findInText(text: string, quote: string): { start: number; end: number } | null {
  const exact = text.indexOf(quote);
  if (exact !== -1) return { start: exact, end: exact + quote.length };

  // Same words in the same order; spacing and quote styles may differ.
  const words = quote.split(/\s+/).map(wordPattern);
  const match = new RegExp(words.join("\\s+")).exec(text);
  return match ? { start: match.index, end: match.index + match[0].length } : null;
}

export function findEvidence(paragraphs: { text: string }[], quote: string): EvidenceMatch | null {
  const trimmed = quote.trim();
  if (trimmed === "") return null;

  for (let i = 0; i < paragraphs.length; i++) {
    const found = findInText(paragraphs[i].text, trimmed);
    if (found) {
      return { quote: paragraphs[i].text.slice(found.start, found.end), paragraph: i, ...found };
    }
  }
  return null;
}

// Widens [start, end) to whole sentence(s), so a selected phrase is explained in context.
export function sentenceAround(text: string, start: number, end: number): string {
  let from = start;
  while (from > 0 && !/[.!?]["'’”)]?\s$/.test(text.slice(Math.max(0, from - 3), from))) from--;
  let to = end;
  while (to < text.length && !/[.!?]/.test(text[to - 1] ?? "")) to++;
  while (to < text.length && /["'’”)]/.test(text[to])) to++;
  return text.slice(from, to).trim();
}
