# CLAUDE.md

IELTS Reading Mistake Analyzer: a tool that explains why a student got Reading questions wrong. One user (the developer's sister). Read `PRD.md`, `tech-spec.md` and `roadmap.md` before big changes.

## Stack
Next.js (App Router) + TypeScript + Tailwind · Gemini via `@google/genai` (server only) · Dexie/IndexedDB · zod

## Commands
- `npm run dev`
- `npm run build`
- `npm run lint`

## Rules
- **Secrets:** never hardcode, log or commit the API key. Read `process.env.GEMINI_API_KEY` in server code only. `.env.local` stays gitignored.
- **Answer key:** the key from the user is always correct. Never let the model choose or change the right answer.
- **Evidence quotes:** must exist verbatim in the passage. Verify in code before showing.
- **Structured output:** all Gemini calls use JSON with the schema in `lib/schema.ts`, validated with zod.
- **Prompts:** live only in `lib/prompts.ts`.
- **Explanations:** simple English (B1), short sentences, Uzbek (Latin script) below.
- **Free tier only:** no paid services.
- **Keep it simple:** one user, no auth, no server database.
- **Dependencies:** ask before adding new ones.
- **Scope:** small, focused changes. Follow the current roadmap phase.
