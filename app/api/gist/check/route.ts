// Paragraph gist drill: one Gemini call (Flash-Lite first) checks her main-idea line for every
// labelled paragraph. Only the paragraphs and her lines go to the model, never the answer key.
// The browser caches every result in IndexedDB by test + her lines.
import { describeGeminiError, generateJson } from "@/lib/gemini";
import { GIST_SYSTEM_PROMPT, buildGistPrompt } from "@/lib/prompts";
import { GistCheckRequestSchema, GistCheckSchema, gistCheckJsonSchema, type GistCheckResponse } from "@/lib/schema";
import { paragraphLabels } from "@/lib/test-schema";
import { getTest } from "@/lib/tests";

// First try + one retry if the JSON is invalid or a paragraph is missing.
const MAX_ATTEMPTS = 2;

function reply(body: GistCheckResponse, status = 200) {
  return Response.json(body, { status });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply({ ok: false, error: "Request body must be JSON." }, 400);
  }
  const parsed = GistCheckRequestSchema.safeParse(body);
  if (!parsed.success) {
    return reply({ ok: false, error: "Write one short line (up to 200 characters) for each paragraph." }, 400);
  }
  const test = getTest(parsed.data.testId);
  if (!test) return reply({ ok: false, error: "This test does not exist." }, 404);

  // A labelled section can have several paragraphs: the unlabelled ones after it belong to it.
  const labels = paragraphLabels(test);
  const textByLabel = new Map<string, string[]>();
  test.passage.paragraphs.forEach((p, i) => {
    const label = labels[i];
    if (label) textByLabel.set(label, [...(textByLabel.get(label) ?? []), p.text]);
  });
  const summaries = parsed.data.summaries;
  if (Object.keys(summaries).some((label) => !textByLabel.has(label))) {
    return reply({ ok: false, error: "That paragraph is not in this passage." }, 400);
  }
  const sections = [...textByLabel]
    .filter(([label]) => summaries[label])
    .map(([label, texts]) => ({ label, text: texts.join("\n\n"), summary: summaries[label] }));
  if (sections.length === 0) return reply({ ok: false, error: "Write at least one line." }, 400);

  const prompt = buildGistPrompt({ title: test.passage.title, sections });
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let raw: string;
    try {
      raw = await generateJson({ system: GIST_SYSTEM_PROMPT, prompt, jsonSchema: gistCheckJsonSchema, prefer: "lite" });
    } catch (err) {
      console.error("[gist/check] Gemini call failed:", err instanceof Error ? err.message : err);
      return reply({ ok: false, error: describeGeminiError(err) }, 502);
    }

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      json = null;
    }
    const result = GistCheckSchema.safeParse(json);
    if (!result.success) continue;
    // One item per paragraph she wrote about, in passage order.
    const byLabel = new Map(result.data.paragraphs.map((p) => [p.label.trim().toUpperCase(), p]));
    const paragraphs = sections.flatMap((s) => {
      const p = byLabel.get(s.label);
      return p ? [{ ...p, label: s.label }] : [];
    });
    if (paragraphs.length === sections.length) return reply({ ok: true, check: { paragraphs } });
  }

  return reply({ ok: false, error: "Gemini gave an answer in the wrong format. Try again." }, 502);
}
