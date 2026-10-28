// Schemas for Gemini output and API requests. One zod schema per shape;
// the JSON Schema sent to Gemini is generated from it.
import { z } from "zod";

export const TRAP_TYPES = [
  "distractor",
  "negative",
  "synonym",
  "not_given_logic",
  "grammar",
  "vocab",
  "other",
] as const;

export const AnalysisSchema = z.object({
  questionNumber: z.number().int(),
  questionType: z.string().describe("IELTS question type, e.g. TRUE/FALSE/NOT GIVEN"),
  evidence: z.object({
    quote: z.string().describe("Copied character for character from the passage"),
  }),
  synonyms: z.array(
    z.object({
      questionPhrase: z.string(),
      passagePhrase: z.string(),
      meaningUz: z.string(),
    }),
  ),
  trap: z.object({
    type: z.enum(TRAP_TYPES),
    explanationEn: z.string(),
    explanationUz: z.string(),
  }),
  grammar: z
    .object({
      parts: z.array(z.object({ text: z.string(), role: z.string(), noteEn: z.string() })),
      ruleEn: z.string(),
      ruleUz: z.string(),
    })
    .nullable(),
  logic: z.array(z.object({ en: z.string(), uz: z.string() })),
  newVocab: z.array(z.object({ word: z.string(), meaningEn: z.string(), meaningUz: z.string() })),
});

export type Analysis = z.infer<typeof AnalysisSchema>;

// JSON Schema for Gemini structured output. Gemini does not accept "$schema".
export const analysisJsonSchema = z.toJSONSchema(AnalysisSchema);
delete analysisJsonSchema.$schema;

// The browser only says which test, which question and what she answered (all her
// answers, because a "choose TWO" question is graded together with its partner).
// The passage, questions and correct answer are loaded on the server.
export const AnalyzeRequestSchema = z.object({
  testId: z.string().min(1).max(100),
  number: z.number().int().positive(),
  answers: z.record(z.string().regex(/^\d+$/), z.string().max(200)),
});

export type AnalyzePromptInput = {
  passage: string;
  questions: string;
  number: number;
  given: string;
  correct: string[]; // accepted answers from the key; the first is the main one
  repeatOf?: number; // she gave this correct "choose TWO" letter already, for that question
};

// What /api/analyze returns. The evidence location is found in code, never
// taken from the model: null means the quote could not be found in the passage.
export type AnalyzeResponse =
  | {
      ok: true;
      analysis: Analysis;
      evidence: { quote: string; paragraph: number; start: number; end: number } | null;
    }
  | { ok: false; error: string };

export const GradeRequestSchema = z.object({
  answers: z.record(z.string().regex(/^\d+$/), z.string().max(200)),
});
