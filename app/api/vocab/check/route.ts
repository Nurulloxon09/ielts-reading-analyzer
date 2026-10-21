// "Use in a sentence": checks a sentence she wrote with one of her saved words.
// The browser caches every result in IndexedDB, so the same sentence is never checked twice.
import { describeGeminiError, generateJson } from "@/lib/gemini";
import { VOCAB_CHECK_SYSTEM_PROMPT, buildVocabCheckPrompt } from "@/lib/prompts";
import {
  VocabCheckRequestSchema,
  VocabCheckSchema,
  vocabCheckJsonSchema,
  type VocabCheckResponse,
} from "@/lib/schema";

// First try + one retry if the JSON is invalid.
const MAX_ATTEMPTS = 2;

function reply(body: VocabCheckResponse, status = 200) {
  return Response.json(body, { status });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply({ ok: false, error: "Request body must be JSON." }, 400);
  }

  const parsed = VocabCheckRequestSchema.safeParse(body);
  if (!parsed.success) {
    return reply({ ok: false, error: "Write one sentence (up to 300 characters) with the word." }, 400);
  }
  const prompt = buildVocabCheckPrompt(parsed.data);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let raw: string;
    try {
      raw = await generateJson({
        system: VOCAB_CHECK_SYSTEM_PROMPT,
        prompt,
        jsonSchema: vocabCheckJsonSchema,
        prefer: "lite",
      });
    } catch (err) {
      console.error("[vocab/check] Gemini call failed:", err instanceof Error ? err.message : err);
      return reply({ ok: false, error: describeGeminiError(err) }, 502);
    }

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      json = null;
    }
    const result = VocabCheckSchema.safeParse(json);
    if (result.success) return reply({ ok: true, check: result.data });
  }

  return reply({ ok: false, error: "Gemini gave an answer in the wrong format. Try again." }, 502);
}
