# PRD — IELTS Reading Mistake Analyzer

## Problem
Students skip analyzing their IELTS Reading mistakes because it takes too long. The first user (my sister, 20, university student, Reading ~6.0) loses meaning because of limited vocabulary, long confusing sentences and complex grammar.

## Goal
Make mistake analysis fast enough to do after every passage. Score target: Reading 6.0 → 7–7.5 first (9.0 in 1–2 months is not realistic).

## User
One user for now: my sister, on a laptop, in the browser. Other students maybe later.

## V1 features
1. **Tests:** the admin (me) adds fixed passages with their questions and official answer key. She only picks a test and solves it in a real IELTS-style layout (passage left, questions right, timer). Analysis starts only after she submits.
2. **Five-layer analysis per wrong answer:**
   - **Evidence locator:** the exact sentence holding the answer, highlighted in the passage.
   - **Synonym map:** question keywords side by side with their paraphrase in the passage.
   - **Trap analysis:** why her answer was wrong (distractor word, missed negative like "rarely", misunderstood concept).
   - **Grammar breakdown:** the hard sentence split into parts, grammar explained in context.
   - **Logic correction:** step-by-step thinking from question to answer, fixing her line of thought.
3. **Explain this sentence:** she selects any sentence while reading and gets a breakdown.
4. **Language:** simple English, with Uzbek underneath.
5. **Save every mistake.**

## V2 features
- Mistake log tagged by trap type (synonym, negative, NOT GIVEN logic, grammar, vocab)
- Stats: her top 3 weaknesses
- Review quiz from saved mistakes and vocabulary

## Rules
- The official answer key is always right. The AI explains it; it never picks the answer.
- Free tools only. Budget is $0.

## Out of scope (for now)
Scraping (Firecrawl), accounts, multiple users, Listening/Writing/Speaking.

## Success
- She analyzes a full passage in under 5 minutes.
- She uses it at least 5 days a week.
- Her mock Reading score moves toward 7+.
