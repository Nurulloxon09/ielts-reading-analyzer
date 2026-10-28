# CLAUDE.md

IELTS Reading Mistake Analyzer: a tool that explains why a student got Reading questions wrong. One user (the developer's sister). Read `PRD.md`, `tech-spec.md` and `roadmap.md` before big changes.

## How it works
- **Admin (the developer)** adds tests as JSON files in `content/tests/`. To add one, follow `docs/add-test.md` exactly.
- **Student** picks a test on `/`, solves it on `/test/[id]` (passage left, questions right, like the computer IELTS), submits.
- **After submit:** `POST /api/tests/[id]/grade` checks answers on the server, then `POST /api/analyze` explains each mistake. The answer key never goes to the browser.
- **Also after submit:** selecting text in the passage calls `POST /api/explain`. Attempts, explained mistakes, new words and cached explanations are saved in IndexedDB (`lib/db.ts`).
- **Vocabulary:** `/vocab` lists every saved word (search, sort, filter by test). Browser only, no Gemini. On the results screen, "Add to vocabulary" calls `POST /api/vocab/define` (Flash-Lite first) only for words not saved yet. `/vocab/practice` checks her own sentences with `POST /api/vocab/check`, cached per word + sentence.
- **Mistake replay:** explained mistakes come back on `/replay` (due after 3 days; right: 7 days, then mastered; wrong: 2 days). Only the question is shown; grading uses the grade route. No Gemini.

## Stack
Next.js (App Router) + TypeScript + Tailwind · Gemini via `@google/genai` (server only) · Dexie/IndexedDB · zod

## Commands
- `npm run dev`
- `npm run build`
- `npm run lint`
- `npx vercel deploy --prod` (deploy to https://ielts-reading-analyzer-gray.vercel.app; needs `npx vercel login` once)

## Rules
- **Secrets:** never hardcode, log or commit the API key. Read `process.env.GEMINI_API_KEY` in server code only. `.env.local` stays gitignored.
- **Answer key:** the key in the test file is always correct. Never let the model choose or change the right answer, and never send the key to the browser (`toPublicTest`).
- **Passages:** copy test passages exactly from the source; never rewrite them.
- **Evidence quotes:** must exist verbatim in the passage. Verify in code before showing.
- **Structured output:** all Gemini calls use JSON with the schema in `lib/schema.ts`, validated with zod.
- **Prompts:** live only in `lib/prompts.ts`.
- **Explanations:** simple English (B1), short sentences, Uzbek (Latin script) below.
- **Free tier only:** no paid services.
- **Keep it simple:** one user, no auth, no server database.
- **Dependencies:** ask before adding new ones.
- **Scope:** small, focused changes. Follow the current roadmap phase.
