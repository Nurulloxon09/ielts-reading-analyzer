// Format of a reading test file in content/tests/<id>.json.
// The admin adds these files; the student only solves them.
// Shared by server and client code (no Node APIs here).
import { z } from "zod";

const Paragraph = z.object({
  label: z.string().trim().max(3).optional(), // "A", "B"… for paragraph-matching tasks
  text: z.string().trim().min(1),
});

const Option = z.object({
  key: z.string().trim().min(1).max(5), // "A", "B", "iv"…
  text: z.string().trim().default(""),
});

const Item = z.object({
  n: z.number().int().positive(),
  text: z.string().trim().min(1),
});

const instructions = z.string().trim().min(1);

export const GroupSchema = z.discriminatedUnion("type", [
  // TRUE / FALSE / NOT GIVEN
  z.object({ type: z.literal("tfng"), instructions, questions: z.array(Item).min(1) }),
  // YES / NO / NOT GIVEN
  z.object({ type: z.literal("ynng"), instructions, questions: z.array(Item).min(1) }),
  // Note / sentence / summary / table completion and diagram labelling. Blanks are written as {{n}}.
  // A line starting with "- " is a bullet, "## " is a heading, anything else is plain text.
  z.object({
    type: z.literal("gap"),
    instructions,
    title: z.string().trim().optional(),
    image: z.object({ src: z.url({ protocol: /^https$/ }), alt: z.string().trim().min(1) }).optional(), // the diagram to label
    lines: z.array(z.string().trim().min(1)).min(1),
  }),
  // Multiple choice, one answer
  z.object({
    type: z.literal("mcq"),
    instructions,
    questions: z.array(Item.extend({ options: z.array(Option).min(2) })).min(1),
  }),
  // Matching: headings, paragraph information, features, sentence endings
  z.object({
    type: z.literal("matching"),
    instructions,
    optionsTitle: z.string().trim().optional(),
    options: z.array(Option).min(2),
    questions: z.array(Item).min(1),
  }),
]);

export type QuestionGroup = z.infer<typeof GroupSchema>;

const AnswerValue = z.union([
  z.string().trim().min(1),
  z.array(z.string().trim().min(1)).min(1), // several accepted answers, e.g. ["smell", "scent"]
]);

export const TestSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "id must be lowercase-with-dashes"),
    title: z.string().trim().min(1),
    source: z.string().trim().optional(), // e.g. "Cambridge IELTS 14, Test 1"
    passageNumber: z.number().int().min(1).max(3).default(1),
    minutes: z.number().int().positive().default(20),
    passage: z.object({
      title: z.string().trim().min(1),
      subtitle: z.string().trim().optional(),
      paragraphs: z.array(Paragraph).min(1),
    }),
    groups: z.array(GroupSchema).min(1),
    answers: z.record(z.string().regex(/^\d+$/), AnswerValue),
  })
  .superRefine((test, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });
    const seen = new Set<number>();

    for (const group of test.groups) {
      for (const n of groupNumbers(group)) {
        if (seen.has(n)) issue(`Question ${n} appears twice.`);
        seen.add(n);

        const raw = test.answers[String(n)];
        if (raw === undefined) {
          issue(`Question ${n} has no answer in "answers".`);
          continue;
        }
        const accepted = (Array.isArray(raw) ? raw : [raw]).map((a) => a.toUpperCase());
        const allowed = allowedAnswers(group, n);
        if (allowed) {
          for (const a of accepted) {
            if (!allowed.includes(a)) {
              issue(`Question ${n}: answer "${a}" must be one of ${allowed.join(", ")}.`);
            }
          }
        }
      }
    }

    for (const key of Object.keys(test.answers)) {
      if (!seen.has(Number(key))) issue(`"answers" has question ${key}, but no group asks it.`);
    }
  });

export type Test = z.infer<typeof TestSchema>;

// What the browser gets: everything except the answer key.
export type PublicTest = Omit<Test, "answers">;

// A section label ("A") covers the unlabelled paragraphs after it until the next label.
export function paragraphLabels(test: PublicTest): (string | undefined)[] {
  let current: string | undefined;
  return test.passage.paragraphs.map((p) => (current = p.label ?? current));
}

// Question numbers asked by one group, in order.
export function groupNumbers(group: QuestionGroup): number[] {
  if (group.type === "gap") {
    return group.lines.flatMap((line) => [...line.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])));
  }
  return group.questions.map((q) => q.n);
}

export function allNumbers(test: PublicTest): number[] {
  return test.groups.flatMap(groupNumbers);
}

export const TFNG_OPTIONS = ["TRUE", "FALSE", "NOT GIVEN"];
export const YNNG_OPTIONS = ["YES", "NO", "NOT GIVEN"];

// Fixed answer choices for a question, or null for free-text (gap) answers.
function allowedAnswers(group: QuestionGroup, n: number): string[] | null {
  switch (group.type) {
    case "tfng":
      return TFNG_OPTIONS;
    case "ynng":
      return YNNG_OPTIONS;
    case "mcq":
      return group.questions.find((q) => q.n === n)?.options.map((o) => o.key.toUpperCase()) ?? null;
    case "matching":
      return group.options.map((o) => o.key.toUpperCase());
    case "gap":
      return null;
  }
}
