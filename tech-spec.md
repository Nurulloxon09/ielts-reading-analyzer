# Tech spec

## Stack (all free)
- **App:** Next.js (App Router) + TypeScript + Tailwind
- **AI:** Gemini API via `@google/genai`, called only from server routes so the key never reaches the browser
- **Hosting:** run locally on her laptop, or Vercel free tier
- **Storage:** IndexedDB in the browser (Dexie), plus JSON export/import as backup
- **Validation:** zod for all AI output

## Environment
`.env.local` (gitignored, never committed):
```
GEMINI_API_KEY=
GEMINI_MODEL=   # current Gemini Flash model name from AI Studio
```

## Data flow
1. **Tests:** the admin adds `content/tests/<id>.json` (passage, question groups, answer key) via Claude Code (`docs/add-test.md`). Format: `lib/test-schema.ts`.
2. **Solve:** `/test/[id]` shows the passage and questions like the computer IELTS, with a timer. The browser never gets the answer key. Answers in progress are kept in localStorage.
3. **Grade:** `POST /api/tests/[id]/grade` compares her answers with the key (case-, space- and punctuation-insensitive).
4. **Analyze:** `POST /api/analyze` ({testId, number, given}) runs one Gemini call per wrong answer, in sequence. The server loads the passage, questions and correct answer itself.
5. **Check:** the server confirms the evidence quote exists verbatim in the passage. If it doesn't, it retries once, then shows "couldn't locate".
6. **Show and save:** the current result and its explanations are kept in localStorage. Every submitted attempt, explained mistake and new word is also saved to IndexedDB (`lib/db.ts`) for the mistake log.
7. **Explain this sentence:** after submitting, she selects text in the passage. `POST /api/explain` ({testId, text}) checks the text is in the passage, widens it to the full sentence and returns a breakdown. Explanations are cached in IndexedDB, so the same sentence never costs a second Gemini call.

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

## Data model (IndexedDB, `lib/db.ts`)
- `sessions`: id, testId, title, finishedAt, correct, total, timeSpentMs (one per submitted attempt)
- `mistakes`: id, sessionId, testId, questionNumber, given, correct, trapType, analysis, evidence, createdAt (saved when a mistake is explained)
- `vocab`: word (lowercase key), display, meaningEn, meaningUz, mistakeId (missing for words from "Explain this sentence"), testId, reviewCount, addedAt
- `explanations`: key (testId + selected text), explanation, createdAt (cache for `/api/explain`)

## Prompt rules
- The answer key is given and correct. Explain it; never re-judge it.
- The evidence quote must be copied exactly from the passage.
- English at B1 level, short sentences. Uzbek in Latin script under each explanation.
- Temperature: default. Google advises against lowering it for Gemini 3 models; consistency comes from the JSON schema and the evidence check.

## Folders
```
content/tests/*.json            reading tests (admin)
app/page.tsx                    test list
app/test/[id]/page.tsx          solve + results
app/api/tests/[id]/grade        grading
app/api/analyze                 one mistake → Gemini
app/api/explain                 selected sentence → Gemini
lib/test-schema.ts  lib/tests.ts  lib/test-text.ts  lib/answers.ts
lib/gemini.ts  lib/prompts.ts  lib/schema.ts  lib/evidence.ts  lib/storage.ts  lib/db.ts
components/
```

## Risks
- **Free-tier rate limits:** run calls in sequence and retry with backoff.
- **Data lives in one browser:** add a JSON export button early.
