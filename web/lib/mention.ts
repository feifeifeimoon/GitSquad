// Returns the in-progress @mention query at the end of the text before the
// caret, or null when the caret is not immediately after `@query`. This is a
// pure helper so the trigger logic is unit-testable without a DOM.
export function mentionQueryAt(textBeforeCaret: string): string | null {
  const m = /(?:^|\s)@([\w-]*)$/.exec(textBeforeCaret);
  return m ? m[1] : null;
}
