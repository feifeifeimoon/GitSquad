"use client";

import { useEffect, useState } from "react";
import { ArrowUp, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { issueApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { MarkdownEditor } from "@/components/markdown-editor-lazy";
import { cn } from "@/lib/utils";

/**
 * The issue page's comment box, owning the text being written.
 *
 * Like the create dialog, the draft stays inside the component that edits it:
 * held by the page, every keystroke re-parsed the markdown of every comment in
 * the activity feed above it.
 *
 * Three things follow the two references — Linear's box and multica's
 * `CommentInput` — rather than the three-line box with a footer this used to be:
 *
 *  - It **rests at one line and opens on focus**. An empty comment box is most
 *    of what is on screen for the moments nobody is writing, and it was paying
 *    a hundred pixels and a hairline rule to say so.
 *  - **Send is an icon in the corner** of the box rather than a labelled button
 *    on a bar. It is acknowledged where it is — spinner, then the comment
 *    arrives above — instead of by swapping a word in a footer.
 *  - **`⌘↵` sends**, because `↵` has to stay a newline in a markdown box.
 *
 * The draft survives leaving the page. It is kept per issue in `sessionStorage`,
 * so a reload or a detour through the board does not cost the paragraph you were
 * writing — and it is `sessionStorage` rather than `localStorage` on purpose: a
 * draft belongs to this browsing session, and a half-sentence from last week
 * reappearing under the box would be a haunting, not a feature.
 */
const draftKey = (slug: string, issueKey: string) =>
  `gitsquad_draft:${slug}:${issueKey}`;

/** Private windows and sandboxed frames throw on `sessionStorage` access. */
function readDraft(key: string): string {
  if (typeof window === "undefined") return "";
  try {
    return window.sessionStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeDraft(key: string, content: string): void {
  try {
    if (content.trim()) window.sessionStorage.setItem(key, content);
    else window.sessionStorage.removeItem(key);
  } catch {
    // No storage: the draft simply does not outlive the page.
  }
}

export function CommentComposer({
  slug,
  issueKey,
  mentionItems,
  onPosted,
}: {
  slug: string;
  issueKey: string;
  mentionItems: string[];
  onPosted: () => void;
}) {
  const storageKey = draftKey(slug, issueKey);
  // What the editor opens with. It is seeded at mount only, so this is the
  // restored draft for the first mount and "" for the remount that clears it.
  const [seed, setSeed] = useState(() => readDraft(storageKey));
  const [content, setContent] = useState(seed);
  const [posting, setPosting] = useState(false);
  const [focused, setFocused] = useState(false);
  // The editor is uncontrolled, so clearing the draft is a remount. That
  // remount is also what drops the caret, so the box asks for it back: the
  // comment you just sent is rarely the last one.
  const [refocus, setRefocus] = useState(false);
  const [editorKey, setEditorKey] = useState(0);

  useEffect(() => {
    writeDraft(storageKey, content);
  }, [storageKey, content]);

  const post = async () => {
    if (!content.trim() || posting) return;
    setPosting(true);
    try {
      await issueApi.addComment(slug, issueKey, content);
      setContent("");
      setSeed("");
      setRefocus(true);
      setEditorKey((k) => k + 1);
      onPosted();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to post comment",
      );
    } finally {
      setPosting(false);
    }
  };

  // One line at rest, a paragraph's worth of room once you are in it — or once
  // there is something to come back to.
  const open = focused || content.trim().length > 0;

  return (
    <div
      // Focus is tracked on the wrapper, not the editor: the send button is
      // inside it, so pressing send is not leaving the box.
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setFocused(false);
        }
      }}
      className={cn(
        "relative rounded-lg border bg-canvas transition-colors",
        focused ? "border-hairline-strong" : "border-hairline",
      )}
    >
      <MarkdownEditor
        key={editorKey}
        content={seed}
        onChange={setContent}
        onSubmit={post}
        autoFocus={refocus}
        ariaLabel="Write a comment"
        placeholder="Add a comment… (@mention an agent)"
        mentionItems={mentionItems}
        // `pb-10` is the room the send button lives in, so the box has to grow
        // its padding with its height: reserved at rest, it would hold the box
        // open at three lines while it is empty.
        //
        // `min-h-10` is not decoration — `.tiptap-content` carries a global
        // `min-height: 8rem` that no class can remove, only outrank. Without it
        // the box rests at 128px and the collapse does nothing.
        //
        // Docked, the box grows upward as you write, so it is capped: a draft
        // long enough to fill the screen would otherwise take the thread with
        // it. Past the cap the editor scrolls inside itself.
        className={cn(
          "max-h-[45vh] overflow-y-auto px-3 pt-2 transition-[min-height,padding]",
          open ? "min-h-[96px] pb-10" : "min-h-10 pb-2",
        )}
      />
      <div className="absolute bottom-2 right-2">
        <Button
          type="button"
          size="icon-sm"
          className="rounded-full"
          // Sending is not leaving: keep the caret in the box, so it stays open
          // and the next comment can be typed without clicking back in.
          onMouseDown={(event) => event.preventDefault()}
          onPointerDown={(event) => event.preventDefault()}
          onClick={post}
          disabled={!content.trim() || posting}
          title={`Comment · ${sendShortcut()}`}
          aria-label="Comment"
        >
          {posting ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <ArrowUp className="size-4" />
          )}
        </Button>
      </div>
    </div>
  );
}

/** The send chord, spelled for the keyboard in front of the reader. */
function sendShortcut(): string {
  const mac =
    typeof navigator !== "undefined" &&
    /Mac|iP(hone|ad|od)/.test(navigator.userAgent);
  return mac ? "⌘↵" : "Ctrl↵";
}
