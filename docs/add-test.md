# Add a reading test

Use this when the admin says "add this test" or "add a passage" and gives you a passage, questions and answer key (text, screenshots or a PDF).

The admin gives you a passage, its questions and the official answer key. You write ONE file: `content/tests/<id>.json`. The format is defined in `lib/test-schema.ts`; `content/tests/language-of-bees.json` is a full example.

## Rules

1. **Copy the passage exactly.** Same words, spelling and punctuation as the source. Do not fix, shorten or rewrite anything. The evidence highlighter searches for exact sentences.
2. **Answers come only from the official key.** Never solve the questions yourself. If the key is missing or unclear for any question, stop and ask the admin.
3. Keep the original question numbers (Passage 2 usually starts at 14, Passage 3 at 27).
4. One passage per file. A full test with 3 passages = 3 files (`cambridge-14-test-1-p1`, `-p2`, `-p3`).

## Fields

- `id`: lowercase-with-dashes, same as the file name.
- `title`: passage title. `source`: e.g. "Cambridge IELTS 14, Test 1" (kept for the admin; not shown in the app).
- `passageNumber`: 1, 2 or 3. `minutes`: usually 20.
- `passage.paragraphs`: one entry per paragraph. Add `label` ("A", "B"…) only if the source labels paragraphs. If a labelled section has several paragraphs, label only its first paragraph; the others belong to it.

## Question groups (`groups`)

Copy the instructions text as written, one line per `\n`.

| Source question type | `type` | Notes |
| --- | --- | --- |
| TRUE / FALSE / NOT GIVEN | `tfng` | `questions: [{ n, text }]` |
| YES / NO / NOT GIVEN | `ynng` | same as tfng |
| Note, sentence, summary, table, flow-chart completion | `gap` | `lines`: write each blank as `{{n}}`. Start a line with `- ` for a bullet, `## ` for a heading. Optional `title`. |
| Diagram labelling | `gap` | Same, plus `image: { src, alt }` (an `https` link to the source picture). One line per blank, e.g. `"{{1}}"`. |
| Multiple choice (one answer) | `mcq` | `questions: [{ n, text, options: [{ key: "A", text }] }]` |
| Matching headings / information / features / sentence endings | `matching` | `options: [{ key, text }]` (text can be empty for "which paragraph" tasks), optional `optionsTitle`, `questions: [{ n, text }]` |

"Choose TWO letters" questions: split into two `mcq` questions in one group, with the same options and the same answer list, e.g. `"21": ["A", "C"], "22": ["A", "C"]`. Grading counts each letter only once.

## Answer key (`answers`)

`{ "1": "TRUE", "5": "B", "8": ["bulbs", "the bulbs"] }`. Use the exact option words or letters (`TRUE`, `NOT GIVEN`, `B`, `iv`). For gap answers, list every accepted form the key gives, e.g. `"(the) bulbs"` → `["bulbs", "the bulbs"]`.

## Check

Run `npm run build`. It fails with a clear message if the file breaks the format (missing answer, wrong option letter, duplicate number). Then open the test in the browser and check the passage and every question against the source.
