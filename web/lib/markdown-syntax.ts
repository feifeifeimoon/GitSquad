// Markdown block markers read off a paragraph's text, rather than off the
// keystrokes that produced it.
//
// TipTap's input rules fire while the marker and its trailing space are the last
// thing typed. A line that arrives in one piece — an IME committing `## 标题` in
// a single composition — never reaches that state, so the marker would stay
// literal text. These helpers answer the same question from the text instead,
// and stay pure so the recognition is unit-testable without a DOM.

export type MarkdownBlock =
  | { kind: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6 }
  | { kind: "bulletList" }
  | { kind: "orderedList"; start: number }
  | { kind: "blockquote" }
  | { kind: "codeBlock"; language: string };

export interface MarkdownMarker {
  block: MarkdownBlock;
  /** How many characters the marker occupies, trailing space included. */
  length: number;
}

const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;

const HEADING = /^(#{1,6})[ \t]/;
const BULLET = /^[-*+][ \t]/;
const ORDERED = /^(\d{1,9})\.[ \t]/;
const QUOTE = /^>[ \t]/;
// A fence counts only when it is the whole line, mirroring the rule that turns a
// lone ``` into an empty code block.
const FENCE = /^```([A-Za-z0-9+#-]*)[ \t]*$/;

/**
 * The block the paragraph's opening marker stands for, or null when the text
 * does not open with one. Anchored at the start on purpose: a marker only means
 * a block when it opens the paragraph.
 */
export function markdownMarkerAt(text: string): MarkdownMarker | null {
  const fence = FENCE.exec(text);
  if (fence) {
    return { block: { kind: "codeBlock", language: fence[1] }, length: text.length };
  }
  const heading = HEADING.exec(text);
  if (heading) {
    return {
      block: { kind: "heading", level: HEADING_LEVELS[heading[1].length - 1] },
      length: heading[0].length,
    };
  }
  const bullet = BULLET.exec(text);
  if (bullet) {
    return { block: { kind: "bulletList" }, length: bullet[0].length };
  }
  const ordered = ORDERED.exec(text);
  if (ordered) {
    return {
      block: { kind: "orderedList", start: Number(ordered[1]) },
      length: ordered[0].length,
    };
  }
  const quote = QUOTE.exec(text);
  if (quote) {
    return { block: { kind: "blockquote" }, length: quote[0].length };
  }
  return null;
}

/** The list node a marker creates, for the two list markers. */
export function markerListName(
  marker: MarkdownMarker,
): "bulletList" | "orderedList" | null {
  if (marker.block.kind === "bulletList") return "bulletList";
  if (marker.block.kind === "orderedList") return "orderedList";
  return null;
}
