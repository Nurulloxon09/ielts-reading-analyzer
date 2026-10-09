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
1. **Input:** she pastes the passage and questions, then fills an answer table: question no. · her answer · correct answer.
2. **Compare:** the client marks wrong answers (case- and space-insensitive).
3. **Analyze:** `POST /api/analyze` runs one Gemini call per wrong answer, in sequence, with a progress bar.
4. **Check:** the server confirms the evidence quote exists verbatim in the passage. If it doesn't, it retries once, then shows "couldn't locate".
5. **Show and save:** the client renders the passage with highlights and an analysis panel, then saves to IndexedDB.

Other routes:
- `POST /api/extract`: photo/PDF in → passage and questions as text. She checks and edits before analysis.
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
app/page.tsx              input
app/session/[id]/page.tsx analysis view
app/api/analyze|explain|extract/route.ts
lib/gemini.ts  lib/prompts.ts  lib/schema.ts  lib/db.ts
components/
```

## Risks
- **Free-tier rate limits:** run calls in sequence and retry with backoff.
- **Data lives in one browser:** add a JSON export button early.
