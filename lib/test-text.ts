// Turns a test into plain text (for Gemini) and short question labels (for the results list).
// Shared by server and client code.
import { groupNumbers, type PublicTest, type QuestionGroup } from "@/lib/test-schema";

export function groupRange(group: QuestionGroup): string {
  const nums = groupNumbers(group);
  const first = Math.min(...nums);
  const last = Math.max(...nums);
  return first === last ? `Question ${first}` : `Questions ${first}–${last}`;
}

// Strips the "- " / "## " markers from a gap line.
export function gapLineKind(line: string): { kind: "bullet" | "heading" | "text"; text: string } {
  if (line.startsWith("- ")) return { kind: "bullet", text: line.slice(2) };
  if (line.startsWith("## ")) return { kind: "heading", text: line.slice(3) };
  return { kind: "text", text: line };
}

function blanksAsText(line: string, focus?: number): string {
  return line.replace(/\{\{(\d+)\}\}/g, (_, n) => (Number(n) === focus ? `(${n}) ______` : `(${n}) …`));
}

// One short line per question, e.g. 7 → "nests are created in (7) ______ where eggs are laid."
export function questionLabels(test: PublicTest): Map<number, string> {
  const labels = new Map<number, string>();
  for (const group of test.groups) {
    if (group.type === "gap") {
      for (const line of group.lines) {
        const { text } = gapLineKind(line);
        for (const m of line.matchAll(/\{\{(\d+)\}\}/g)) {
          labels.set(Number(m[1]), blanksAsText(text, Number(m[1])));
        }
      }
    } else {
      for (const q of group.questions) labels.set(q.n, q.text);
    }
  }
  return labels;
}

// Paragraphs as the model sees them. Labels go on their own line so quotes never include them.
export function passageAsText(test: PublicTest): string {
  const body = test.passage.paragraphs
    .map((p) => (p.label ? `Paragraph ${p.label}\n${p.text}` : p.text))
    .join("\n\n");
  return `${test.passage.title}\n\n${body}`;
}

export function questionsAsText(test: PublicTest): string {
  return test.groups
    .map((group) => {
      const head = `${groupRange(group)}\n${group.instructions}`;
      switch (group.type) {
        case "tfng":
        case "ynng":
          return `${head}\n${group.questions.map((q) => `${q.n}. ${q.text}`).join("\n")}`;
        case "gap":
          return `${head}\n${group.title ? `${group.title}\n` : ""}${group.image ? `[Diagram: ${group.image.alt}]\n` : ""}${group.lines
            .map((l) => blanksAsText(gapLineKind(l).text))
            .join("\n")}`;
        case "mcq":
          return `${head}\n${group.questions
            .map((q) => `${q.n}. ${q.text}\n${q.options.map((o) => `   ${o.key}. ${o.text}`).join("\n")}`)
            .join("\n")}`;
        case "matching":
          return `${head}\n${group.optionsTitle ? `${group.optionsTitle}\n` : ""}${group.options
            .map((o) => `${o.key}${o.text ? `. ${o.text}` : ""}`)
            .join("\n")}\n${group.questions.map((q) => `${q.n}. ${q.text}`).join("\n")}`;
      }
    })
    .join("\n\n");
}
