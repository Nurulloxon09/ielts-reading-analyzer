// Paraphrase drill pairs. No Gemini: phrases from her mistakes are checked against the passage,
// and finished tests add their "paraphrases" list and each TRUE/YES statement with its evidence.
import { findEvidence } from "@/lib/evidence";
import { ParaphrasePairsRequestSchema, type ParaphrasePair } from "@/lib/schema";
import type { Test } from "@/lib/test-schema";
import { getTest } from "@/lib/tests";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Request body must be JSON." }, { status: 400 });
  }
  const parsed = ParaphrasePairsRequestSchema.safeParse(body);
  if (!parsed.success) return Response.json({ ok: false, error: "Invalid request." }, { status: 400 });

  const tests = new Map<string, Test | null>();
  const load = (id: string) => {
    if (!tests.has(id)) tests.set(id, getTest(id));
    return tests.get(id) ?? null;
  };
  const pairs: ParaphrasePair[] = [];
  const add = (test: Test, phrase: string, quote: string, from: ParaphrasePair["from"]) => {
    const found = findEvidence(test.passage.paragraphs, quote);
    if (!found) return;
    const { paragraph, start, end } = found;
    pairs.push({ testId: test.id, title: test.title, phrase, quote: found.quote, paragraph, start, end, from });
  };

  for (const m of parsed.data.mistakes) {
    const test = load(m.testId);
    if (test) add(test, m.questionPhrase, m.passagePhrase, "mistake");
  }

  // Only finished tests: these pairs would give answers away before she takes the test.
  for (const id of new Set(parsed.data.testIds)) {
    const test = load(id);
    if (!test) continue;
    for (const p of test.paraphrases ?? []) add(test, p.questionPhrase, p.passageQuote, "test");
    for (const group of test.groups) {
      if (group.type !== "tfng" && group.type !== "ynng") continue;
      for (const q of group.questions) {
        const raw = test.answers[String(q.n)];
        const accepted = Array.isArray(raw) ? raw : [raw];
        // A TRUE / YES statement says the same as its evidence in other words.
        if (q.evidence && accepted.every((a) => a === "TRUE" || a === "YES")) add(test, q.text, q.evidence, "test");
      }
    }
  }

  return Response.json({ ok: true, pairs });
}
