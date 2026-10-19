// Returns the in-progress @mention query at the end of the text before the
// caret, or null when the caret is not immediately after `@query`. This is a
// pure helper so the trigger logic is unit-testable without a DOM.
export function mentionQueryAt(textBeforeCaret: string): string | null {
  // The boundary is the same one the server's mentionRe uses — ASCII \w only —
  // so `请@首席` opens the menu (Chinese runs without spaces) while an email
  // like a@b.com does not. \p{L}/\p{N} with the u flag let the query itself be
  // any script, so an agent named in Chinese is found like an English one.
  const m = /(?:^|[^\w])@([\p{L}\p{N}_-]*)$/u.exec(textBeforeCaret);
  return m ? m[1] : null;
}
