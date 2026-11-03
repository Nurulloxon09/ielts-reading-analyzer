// Paragraph gist drill: which passages fit, and what to compare her lines with afterwards.
// Shared by server and client code. Answers are never included.
import { paragraphLabels, type PublicTest } from "@/lib/test-schema";

// The labels of a passage's sections, in order ("A", "B"…). The drill needs at least two.
export function gistLabels(test: PublicTest): string[] {
  return [...new Set(paragraphLabels(test).filter((l): l is string => Boolean(l)))];
}

export type CompareList = { title: string; items: string[] };

// The test's own headings list, or its "which paragraph contains…" statements. Only the lists
// she also sees in the test; never which item belongs to which paragraph.
export function compareLists(test: PublicTest): CompareList[] {
  const labels = new Set(gistLabels(test));
  const lists: CompareList[] = [];
  for (const group of test.groups) {
    if (group.type !== "matching") continue;
    if (/heading/i.test(group.optionsTitle ?? "")) {
      lists.push({ title: group.optionsTitle ?? "List of Headings", items: group.options.map((o) => `${o.key}  ${o.text}`) });
    } else if (group.options.every((o) => !o.text && labels.has(o.key))) {
      lists.push({ title: "Which paragraph contains…", items: group.questions.map((q) => q.text) });
    }
  }
  return lists;
}
