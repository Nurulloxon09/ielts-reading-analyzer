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

// The browser only says which test, which question and what she answered.
// The passage, questions and correct answer are loaded on the server.
export const AnalyzeRequestSchema = z.object({
  testId: z.string().min(1).max(100),
  number: z.number().int().positive(),
  given: z.string().max(200),
});

export type AnalyzePromptInput = {
  passage: string;
  questions: string;
  number: number;
  given: string;
  correct: string[]; // accepted answers from the key; the first is the main one
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

// "Explain this sentence": she selects text in the passage after submitting.
export const ExplanationSchema = z.object({
  meaningEn: z.string().describe("What the selected text means, in simple words"),
  meaningUz: z.string(),
  parts: z.array(z.object({ text: z.string(), role: z.string(), noteEn: z.string() })),
  grammarEn: z.string().describe("The main grammar point, or an empty string"),
  grammarUz: z.string(),
  vocab: z.array(z.object({ word: z.string(), meaningEn: z.string(), meaningUz: z.string() })),
});

export type Explanation = z.infer<typeof ExplanationSchema>;

export const explanationJsonSchema = z.toJSONSchema(ExplanationSchema);
delete explanationJsonSchema.$schema;

export const ExplainRequestSchema = z.object({
  testId: z.string().min(1).max(100),
  text: z.string().trim().min(2).max(600),
});

export type ExplainPromptInput = {
  passage: string;
  sentence: string; // the full sentence(s) around the selection
  selection: string; // exactly what she selected
};

export type ExplainResponse = { ok: true; explanation: Explanation; text: string } | { ok: false; error: string };

// "Add to vocabulary": she types a word from the passage after submitting.
// The example sentence is found in the passage by the server, not written by the model.
export const VocabDefinitionSchema = z.object({
  display: z.string().describe("Dictionary form of the word, lowercase unless it is a name"),
  partOfSpeech: z.string().describe("noun, verb, adjective, adverb or phrase"),
  meaningEn: z.string().describe("Its meaning in this sentence, one short B1 sentence"),
  meaningUz: z.string(),
  synonyms: z.array(z.string()).min(1).max(5).describe("3 to 5 words with the same meaning in this sentence"),
  antonyms: z.array(z.string()).max(3).describe("0 to 3 opposites; empty if none fit"),
});

export type VocabDefinition = z.infer<typeof VocabDefinitionSchema>;

export const vocabDefinitionJsonSchema = z.toJSONSchema(VocabDefinitionSchema);
delete vocabDefinitionJsonSchema.$schema;

export const VocabDefineRequestSchema = z.object({
  testId: z.string().min(1).max(100),
  word: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .refine((w) => w.split(/\s+/).length <= 4),
});

export type VocabPromptInput = {
  word: string; // what she typed
  found: string; // how it is written in the passage
  sentence: string; // the passage sentence it is in
};

export type VocabDefineResponse =
  | { ok: true; definition: VocabDefinition; exampleFromPassage: string }
  | { ok: false; error: string };
