# Tech spec

## Stack (all free)
- **App:** Next.js (App Router) + TypeScript + Tailwind
- **AI:** Gemini API via `@google/genai`, called only from server routes so the key never reaches the browser
- **Hosting:** Vercel free tier (Hobby), public link: https://ielts-reading-analyzer-gray.vercel.app. Deployed from this folder with the Vercel CLI (no Git integration). The Gemini key and model settings are Vercel environment variables; a new or changed variable needs a redeploy.
- **Storage:** IndexedDB in the browser (Dexie), plus JSON export/import as backup
- **Validation:** zod for all AI output

## Environment
`.env.local` (gitignored, never committed):
```
GEMINI_API_KEY=
GEMINI_MODEL=   # current Gemini Flash model name from AI Studio
GEMINI_FALLBACK_MODELS=   # optional, comma-separated; used in order when a model's free daily limit runs out
```

## Data flow
1. **Tests:** the admin adds `content/tests/<id>.json` (passage, question groups, answer key) via Claude Code (`docs/add-test.md`). Format: `lib/test-schema.ts`.
2. **Home:** `/` lists the tests she hasn't done under Passage 1, 2 and 3, then a "Finished" section (newest first, latest score). "Finished" comes from the `sessions` table plus the result saved in localStorage.
3. **Solve:** `/test/[id]` shows the passage and questions like the computer IELTS, with a timer. The browser never gets the answer key. Answers in progress are kept in localStorage.
4. **Grade:** `POST /api/tests/[id]/grade` compares her answers with the key (case-, space- and punctuation-insensitive).
5. **Analyze:** `POST /api/analyze` ({testId, number, given}) runs one Gemini call per wrong answer, in sequence. The server loads the passage, questions and correct answer itself.
6. **Check:** the server confirms the evidence quote exists verbatim in the passage. If it doesn't, it retries once, then shows "couldn't locate".
7. **Show and save:** the current result and its explanations are kept in localStorage. Every submitted attempt, explained mistake and new word is also saved to IndexedDB (`lib/db.ts`) for the mistake log.
8. **Explain this sentence:** after submitting, she selects text in the passage. `POST /api/explain` ({testId, text}) checks the text is in the passage, widens it to the full sentence and returns a breakdown. Explanations are cached in IndexedDB, so the same sentence never costs a second Gemini call.
9. **Add to vocabulary:** after submitting, she types a word from the passage. If it (or its dictionary form) is already saved, the saved entry is shown with no Gemini call. Otherwise `POST /api/vocab/define` ({testId, word}) finds the word in the passage, takes its sentence as the example and asks Gemini (Flash-Lite first) for the meaning, synonyms and opposites.
10. **Use in a sentence:** `/vocab/practice` shows one saved word (fewest reviews first, then the one reviewed longest ago; words shown in this visit wait for the next round). She writes a sentence; `POST /api/vocab/check` ({word, partOfSpeech, meaningEn, sentence}) asks Gemini (Flash-Lite first) whether the word is used correctly. A new result is saved in `vocabAttempts` and counts as a review; the same word + sentence is answered from IndexedDB with no Gemini call.
11. **Mistake replay:** every explained mistake gets a row in `replays` (one per test question, pointing to the newest mistake). It is due 3 days after the mistake was saved; the home page shows how many are due. `/replay` shows the passage and only that question, with no explanation; `GET /api/tests/[id]` gives the test without the answer key and the existing grade route checks the answer. Right: back in 7 days, mastered (retired) after the second right answer in a row. Wrong: back in 2 days, and the saved explanation is shown again. A new mistake on the same question restarts the schedule. No Gemini.

## Analysis output (JSON schema, enforced with Gemini structured output)
```
{
  questionNumber, questionType,
  evidence: { quote },                       // verbatim from passage
  synonyms: [{ questionPhrase, passagePhrase, meaningUz }],
  trap: { type, explanationEn, explanationUz },
       // type: distractor | negative | synonym | not_given_logic | grammar | vocab | other
  grammar: { parts: [{ text, role, noteEn }], ruleEn, ruleUz } | null,
  logic: [{ en, uz }],                       // ordered steps
  newVocab: [{ word, meaningEn, meaningUz }]
}
```

## Data model (IndexedDB, `lib/db.ts`, Dexie version 3)
- `sessions`: id, testId, title, finishedAt, correct, total, timeSpentMs (one per submitted attempt)
- `mistakes`: id, sessionId, testId, questionNumber, given, correct, trapType, analysis, evidence, createdAt (saved when a mistake is explained)
- `vocab`: word (lowercase key), display, meaningEn, meaningUz, mistakeId (missing for words from "Explain this sentence"), testId, reviewCount, lastReviewedAt, addedAt; optional partOfSpeech, synonyms, antonyms, example
- `explanations`: key (testId + selected text), explanation, createdAt (cache for `/api/explain`)
- `vocabAttempts` (v2): id, key (word + sentence), word, sentence, check, createdAt ("Use in a sentence" history and cache)
- `replays` (v3): id, testId + questionNumber (unique), mistakeId, trapType, dueAt, streak, lastResult, retiredAt. The v3 upgrade creates one for every mistake saved before.
- Schema changes: add `this.version(n + 1).stores(...)` listing only the new or changed tables; existing data is kept.

## Prompt rules
- The answer key is given and correct. Explain it; never re-judge it.
- The evidence quote must be copied exactly from the passage.
- English at B1 level, short sentences. Uzbek in Latin script under each explanation.
- Temperature: default. Google advises against lowering it for Gemini 3 models; consistency comes from the JSON schema and the evidence check.

## Folders
```
content/tests/*.json            reading tests (admin)
app/page.tsx                    test list: Passage 1/2/3 sections, then Finished
app/test/[id]/page.tsx          solve + results
app/vocab/page.tsx              vocabulary bank (IndexedDB only)
app/vocab/practice/page.tsx     use a word in a sentence
app/replay/page.tsx             re-try old mistakes (IndexedDB + grading, no Gemini)
app/api/tests/[id]               one test without the answer key (for replay)
app/api/tests/[id]/grade        grading
app/api/analyze                 one mistake → Gemini
app/api/explain                 selected sentence → Gemini
app/api/vocab/define            typed word → Gemini (Flash-Lite first)
app/api/vocab/check             her sentence → Gemini (Flash-Lite first)
lib/test-schema.ts  lib/tests.ts  lib/test-text.ts  lib/answers.ts
lib/gemini.ts  lib/prompts.ts  lib/schema.ts  lib/evidence.ts  lib/storage.ts  lib/db.ts
components/
```

## Risks
- **Free-tier rate limits:** run calls in sequence and retry with backoff. Each model has its own daily quota (resets at midnight Pacific time), so `lib/gemini.ts` falls back to the next model in `GEMINI_FALLBACK_MODELS` when one runs out. Small tasks pass `prefer: "lite"` to `generateJson`, which tries the configured Flash-Lite models first (bigger daily limit).
- **Data lives in one browser:** add a JSON export button early.
