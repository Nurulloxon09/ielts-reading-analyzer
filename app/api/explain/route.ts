// "Explain this sentence": breaks down text she selected in the passage.
// The selection must be found in the test's passage; it is explained within its full sentence.
import { findEvidence, sentenceAround } from "@/lib/evidence";
import { describeGeminiError, generateJson } from "@/lib/gemini";
import { EXPLAIN_SYSTEM_PROMPT, buildExplainPrompt } from "@/lib/prompts";
import { ExplainRequestSchema, ExplanationSchema, explanationJsonSchema, type ExplainResponse } from "@/lib/schema";
import { passageAsText } from "@/lib/test-text";
import { getTest, toPublicTest } from "@/lib/tests";

// First try + one retry if the JSON is invalid.
const MAX_ATTEMPTS = 2;

function reply(body: ExplainResponse, status = 200) {
  return Response.json(body, { status });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply({ ok: false, error: "Request body must be JSON." }, 400);
  }

  const parsed = ExplainRequestSchema.safeParse(body);
  if (!parsed.success) {
    return reply({ ok: false, error: "Select a few words or a sentence from the passage." }, 400);
  }
  const { testId, text } = parsed.data;

  const test = getTest(testId);
  if (!test) return reply({ ok: false, error: "This test does not exist." }, 404);

  const match = findEvidence(test.passage.paragraphs, text);
  if (!match) {
    return reply({ ok: false, error: "Select text inside one paragraph of the passage." }, 400);
  }
  const paragraph = test.passage.paragraphs[match.paragraph].text;
  const prompt = buildExplainPrompt({
    passage: passageAsText(toPublicTest(test)),
    sentence: sentenceAround(paragraph, match.start, match.end),
    selection: match.quote,
  });

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let raw: string;
    try {
      raw = await generateJson({ system: EXPLAIN_SYSTEM_PROMPT, prompt, jsonSchema: explanationJsonSchema });
    } catch (err) {
      console.error("[explain] Gemini call failed:", err instanceof Error ? err.message : err);
      return reply({ ok: false, error: describeGeminiError(err) }, 502);
    }

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      json = null;
    }
    const result = ExplanationSchema.safeParse(json);
    if (result.success) return reply({ ok: true, explanation: result.data, text: match.quote });
  }

  return reply({ ok: false, error: "Gemini gave an answer in the wrong format. Try again." }, 502);
}
