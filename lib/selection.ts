// Browser only: the text she selected in the passage, as character offsets inside one paragraph
// (the <p data-paragraph={i}> elements in components/Passage.tsx).
export type PassageSelection = { paragraph: number; start: number; end: number; text: string };

// A selection that runs past the end of its first paragraph is cut there. Spaces at both ends
// are left out. Null when nothing (or less than minChars) is selected inside a paragraph.
export function selectionInParagraph(minChars = 3): PassageSelection | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  const startNode = range.startContainer;
  const paragraph = (startNode instanceof Element ? startNode : startNode.parentElement)?.closest<HTMLElement>(
    "[data-paragraph]",
  );
  if (!paragraph) return null;

  const offsetOf = (node: Node, offset: number) => {
    const before = document.createRange();
    before.selectNodeContents(paragraph);
    before.setEnd(node, offset);
    return before.toString().length;
  };
  const text = paragraph.textContent ?? "";
  let start = offsetOf(range.startContainer, range.startOffset);
  let end = paragraph.contains(range.endContainer) ? offsetOf(range.endContainer, range.endOffset) : text.length;
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  if (end - start < minChars) return null;
  return { paragraph: Number(paragraph.dataset.paragraph), start, end, text: text.slice(start, end) };
}
