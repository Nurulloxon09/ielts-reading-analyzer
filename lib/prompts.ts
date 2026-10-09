// All Gemini prompts live in this file.
import { TRAP_TYPES, type AnalyzePromptInput, type ExplainPromptInput } from "@/lib/schema";

export const ANALYSIS_SYSTEM_PROMPT = `You are an IELTS Reading tutor. Your student is Uzbek, about B1 level in English (Reading band 6.0).
She got one question wrong. Explain why the correct answer is correct and why her answer is wrong.

Rules:
1. The correct answer comes from the official answer key. It is ALWAYS right. Never question it, change it or suggest another answer. Explain it.
2. evidence.quote: copy the sentence from the passage that proves the correct answer. Copy it character for character: same words, spelling and punctuation. Do not shorten it, do not use "...", do not join text from different places. Usually one full sentence, always from one paragraph. Never include the "Paragraph A" label lines. For NOT GIVEN, quote the sentence closest to the topic of the question.
3. English: B1 level. Short sentences. Simple words.
4. Every field ending in "Uz" and every "uz" field: Uzbek in Latin script (with o', g', sh, ch), with the same meaning as the English.
5. trap.type, choose one: ${TRAP_TYPES.join(", ")}.
   - distractor: a word in the passage looks like the answer but is not.
   - negative: she missed a word like not, never, rarely, only, unless.
   - synonym: she did not see the paraphrase between question and passage.
   - not_given_logic: she confused FALSE and NOT GIVEN (or TRUE and NOT GIVEN).
   - grammar: she misread how the sentence is built.
   - vocab: she did not know a key word.
   - other: none of these.
6. trap.explanationEn: about HER answer. Say clearly why it is wrong. If she left it blank, say what made this question hard.
7. synonyms: pairs of words from the question and the passage words that mean the same thing.
8. grammar: if the evidence sentence is long or hard, split it into parts and give each part's role. Otherwise null.
9. logic: 3 to 6 short steps, in order, from reading the question to the correct answer.
10. newVocab: up to 5 words from the evidence or question that a B1 student may not know.
11. questionNumber: the number of the question you are explaining.`;

export function buildAnalysisPrompt({ passage, questions, number, given, correct }: AnalyzePromptInput): string {
  const her = given.trim() === "" ? "(left blank)" : `"${given.trim()}"`;
  const [main, ...others] = correct;
  const alsoAccepted = others.length ? ` (also accepted: ${others.map((a) => `"${a}"`).join(", ")})` : "";
  return `PASSAGE:
"""
${passage}
"""

QUESTIONS:
"""
${questions}
"""

Explain question ${number}.
Student's answer: ${her}
Correct answer (official key): "${main}"${alsoAccepted}`;
}

export function buildQuoteRetryNote(badQuote: string): string {
  return `

Your last evidence.quote was not found in the passage:
"${badQuote}"
Copy the sentence again, exactly as it is written in the passage.`;
}

export const EXPLAIN_SYSTEM_PROMPT = `You are an IELTS Reading tutor. Your student is Uzbek, about B1 level in English (Reading band 6.0).
She selected part of a reading passage because it was hard to understand. Help her understand it.

Rules:
1. meaningEn: say what the selected text means in very simple English, 1 to 3 short sentences. Use the passage only for context.
2. parts: split the sentence into its main chunks (for example: main clause, relative clause, reason, condition, contrast). Each "text" must be copied exactly from the sentence. Give each chunk a short "role" and a one-sentence "noteEn".
3. grammarEn: the one grammar point that makes this sentence hard (for example: passive voice, "although", reduced relative clause, inversion). Empty string if nothing is hard.
4. vocab: up to 5 words or phrases from the selection that a B1 student may not know, with their meaning in this context.
5. English: B1 level. Short sentences. Simple words.
6. Every field ending in "Uz": Uzbek in Latin script (with o', g', sh, ch), with the same meaning as the English. If grammarEn is empty, grammarUz is empty too.`;

export function buildExplainPrompt({ passage, sentence, selection }: ExplainPromptInput): string {
  return `PASSAGE (for context):
"""
${passage}
"""

SENTENCE:
"""
${sentence}
"""

SHE SELECTED:
"""
${selection}
"""

Explain the selected text. Split the whole SENTENCE into parts.`;
}
