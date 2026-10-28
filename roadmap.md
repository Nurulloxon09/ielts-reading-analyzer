# Roadmap

About 2 hours a day.

## Week 1 — V1 (Oct 10–16, 2026)
- [x] **Day 1:** Next.js setup, key in `.env.local`, one test Gemini call
- [x] **Day 2:** Input form (passage, questions, answer table)
- [x] **Day 3:** `/api/analyze` with JSON schema and prompt
- [x] **Day 4:** Real-test layout (admin-loaded passages), results, analysis view with highlighted evidence and the 5 sections
- [x] **Day 5:** "Explain this sentence" + save mistakes to IndexedDB
- [x] **Day 6:** Add 5–10 real passages with Claude Code (`docs/add-test.md`) (replaces photo/PDF input: the admin adds tests, not her). 13 real passages so far, plus the sample.
- [ ] **Day 7:** Test with her on 3 real passages, fix what's confusing

## Weeks 2–3 — V2 (Oct 17–30)
- [ ] Mistake log with trap-type tags and filters
- [ ] Stats screen: top 3 weaknesses
- [x] Vocab list + review quiz (`/vocab`, `/vocab/practice`)
- [ ] JSON export/import
- [x] Deploy to Vercel free tier: https://ielts-reading-analyzer-gray.vercel.app

## Later (only if it works for her)
- Firecrawl import
- Accounts and more students
- Drills by question type

## Check-in
At the end of each week: compare her mock Reading score, and ask her what she skips or ignores in the tool.
