// Analyzes ONE wrong answer. The client calls this once per mistake, in sequence.
// Only the test id, question number and her answer come from the browser;
// the passage, questions and official answer are read from the test file.
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
import { passageAsText, questionsAsText } from "@/lib/test-text";
import { acceptedAnswers, getTest, toPublicTest } from "@/lib/tests";

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
    return reply({ ok: false, error: "Missing or invalid test, question or answer." }, 400);
  }
  const { testId, number, given } = parsed.data;

  const test = getTest(testId);
  if (!test) return reply({ ok: false, error: "This test does not exist." }, 404);
  const correct = acceptedAnswers(test, number);
  if (correct.length === 0) {
    return reply({ ok: false, error: `Question ${number} is not in this test.` }, 400);
  }

  const publicTest = toPublicTest(test);
  const basePrompt = buildAnalysisPrompt({
    passage: passageAsText(publicTest),
    questions: questionsAsText(publicTest),
    number,
    given,
    correct,
  });

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

    // The question number comes from the request, never from the model.
    const analysis = { ...result.data, questionNumber: number };
    const evidence = findEvidence(test.passage.paragraphs, analysis.evidence.quote);
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
