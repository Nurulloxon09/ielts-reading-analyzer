// Analyzes ONE wrong answer. The client calls this once per mistake, in sequence.
import { findEvidence } from "@/lib/evidence";
import { describeGeminiError, generateJson } from "@/lib/gemini";
import { ANALYSIS_SYSTEM_PROMPT, buildAnalysisPrompt, buildQuoteRetryNote } from "@/lib/prompts";
import {
  AnalysisSchema,
  AnalyzeRequestSchema,
  analysisJsonSchema,
  type Analysis,
  type AnalyzeResponse,
} from "@/lib/schema";

// First try + one retry if the quote is not in the passage or the JSON is invalid.
const MAX_ATTEMPTS = 2;

function reply(body: AnalyzeResponse, status = 200) {
  return Response.json(body, { status });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply({ ok: false, error: "Request body must be JSON." }, 400);
  }

  const parsed = AnalyzeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return reply({ ok: false, error: "Missing or invalid passage, questions or answer." }, 400);
  }
  const input = parsed.data;
  const basePrompt = buildAnalysisPrompt(input);

  let prompt = basePrompt;
  let lastAnalysis: Analysis | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let text: string;
    try {
      text = await generateJson({
        system: ANALYSIS_SYSTEM_PROMPT,
        prompt,
        jsonSchema: analysisJsonSchema,
      });
    } catch (err) {
      console.error("[analyze] Gemini call failed:", err instanceof Error ? err.message : err);
      return reply({ ok: false, error: describeGeminiError(err) }, 502);
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    const result = AnalysisSchema.safeParse(json);
    if (!result.success) {
      prompt = basePrompt;
      continue;
    }

    // The question number and answer key come from her input, never from the model.
    const analysis = { ...result.data, questionNumber: input.mistake.number };
    const evidence = findEvidence(input.passage, analysis.evidence.quote);
    if (evidence) {
      return reply({ ok: true, analysis: { ...analysis, evidence: { quote: evidence.quote } }, evidence });
    }

    lastAnalysis = analysis;
    prompt = basePrompt + buildQuoteRetryNote(analysis.evidence.quote);
  }

  if (!lastAnalysis) {
    return reply({ ok: false, error: "Gemini gave an answer in the wrong format. Try again." }, 502);
  }

  // Quote still not in the passage: keep the rest, but never show an unverified quote.
  return reply({
    ok: true,
    analysis: { ...lastAnalysis, evidence: { quote: "" } },
    evidence: null,
  });
}
