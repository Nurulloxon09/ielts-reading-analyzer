// "Add to vocabulary": defines a word she typed, as it is used in the passage.
// The word must be in the test's passage; its sentence is found here, so the example is always verbatim.
import { findWord, sentenceAround } from "@/lib/evidence";
import { describeGeminiError, generateJson } from "@/lib/gemini";
import { VOCAB_SYSTEM_PROMPT, buildVocabPrompt } from "@/lib/prompts";
import {
  VocabDefineRequestSchema,
  VocabDefinitionSchema,
  vocabDefinitionJsonSchema,
  type VocabDefineResponse,
} from "@/lib/schema";
import { getTest } from "@/lib/tests";

// First try + one retry if the JSON is invalid.
const MAX_ATTEMPTS = 2;

function reply(body: VocabDefineResponse, status = 200) {
  return Response.json(body, { status });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply({ ok: false, error: "Request body must be JSON." }, 400);
  }

  const parsed = VocabDefineRequestSchema.safeParse(body);
  if (!parsed.success) {
    return reply({ ok: false, error: "Type one word or a short phrase (up to 4 words) from the passage." }, 400);
  }
  const { testId, word } = parsed.data;

  const test = getTest(testId);
  if (!test) return reply({ ok: false, error: "This test does not exist." }, 404);

  const match = findWord(test.passage.paragraphs, word);
  if (!match) {
    return reply(
      { ok: false, error: `"${word}" is not in this passage. Check the spelling and type it as it is written.` },
      400,
    );
  }
  const sentence = sentenceAround(test.passage.paragraphs[match.paragraph].text, match.start, match.end);
  const prompt = buildVocabPrompt({ word, found: match.quote, sentence });

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let raw: string;
    try {
      raw = await generateJson({
        system: VOCAB_SYSTEM_PROMPT,
        prompt,
        jsonSchema: vocabDefinitionJsonSchema,
        prefer: "lite",
      });
    } catch (err) {
      console.error("[vocab/define] Gemini call failed:", err instanceof Error ? err.message : err);
      return reply({ ok: false, error: describeGeminiError(err) }, 502);
    }

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      json = null;
    }
    const result = VocabDefinitionSchema.safeParse(json);
    if (result.success) return reply({ ok: true, definition: result.data, exampleFromPassage: sentence });
  }

  return reply({ ok: false, error: "Gemini gave an answer in the wrong format. Try again." }, 502);
}
