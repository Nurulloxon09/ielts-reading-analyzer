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
1. **Tests:** the admin adds `content/tests/<id>.json` (passage, question groups, answer key) via Claude Code (`/add-test`). Format: `lib/test-schema.ts`.
2. **Solve:** `/test/[id]` shows the passage and questions like the computer IELTS, with a timer. The browser never gets the answer key. Answers in progress are kept in localStorage.
3. **Grade:** `POST /api/tests/[id]/grade` compares her answers with the key (case-, space- and punctuation-insensitive).
4. **Analyze:** `POST /api/analyze` ({testId, number, given}) runs one Gemini call per wrong answer, in sequence. The server loads the passage, questions and correct answer itself.
5. **Check:** the server confirms the evidence quote exists verbatim in the passage. If it doesn't, it retries once, then shows "couldn't locate".
6. **Show and save:** results and explanations are kept in localStorage (IndexedDB mistake log comes in Day 5).

Planned:
- `POST /api/explain`: one sentence + passage context → breakdown.

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

## Data model (IndexedDB)
- `sessions`: id, date, title, passage, questions
- `mistakes`: id, sessionId, questionNumber, trapType, analysis, createdAt
- `vocab`: word, meaningEn, meaningUz, mistakeId, reviewCount

## Prompt rules
- The answer key is given and correct. Explain it; never re-judge it.
- The evidence quote must be copied exactly from the passage.
- English at B1 level, short sentences. Uzbek in Latin script under each explanation.
- Low temperature.

## Folders
```
content/tests/*.json            reading tests (admin)
app/page.tsx                    test list
app/test/[id]/page.tsx          solve + results
app/api/tests/[id]/grade        grading
app/api/analyze                 one mistake → Gemini
lib/test-schema.ts  lib/tests.ts  lib/test-text.ts  lib/answers.ts
lib/gemini.ts  lib/prompts.ts  lib/schema.ts  lib/evidence.ts  lib/storage.ts
components/
```

## Risks
- **Free-tier rate limits:** run calls in sequence and retry with backoff.
- **Data lives in one browser:** add a JSON export button early.
