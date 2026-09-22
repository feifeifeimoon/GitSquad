"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Pencil } from "lucide-react";
import { toast } from "sonner";
import { issueApi } from "@/lib/api";

/**
 * The issue's title, editable where it is.
 *
 * It was a heading and only a heading: `issueApi.update` accepts a title and
 * nothing ever passed one, so a typo in a title was permanent. `↵` saves, `⎋`
 * abandons.
 *
 * Editing is opened by the pencil, not by the heading. Clicking the words
 * themselves is tempting, but it makes the heading a button, and a button whose
 * accessible name is its own text turns the issue's title into a control name
 * for every other button on the page — a spec looking for "Comment" then finds
 * an issue called "Comment target". The description has the same rule for the
 * same reason.
 *
 * Save is optimistic in the sense that matters: the field stays as the reader
 * left it until the server answers, and goes back if it refuses.
 */
export function IssueTitle({
  slug,
  issueKey,
  title,
  onSaved,
}: {
  slug: string;
  issueKey: string;
  title: string;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // No effect keeps the draft in step with the prop: the draft is taken afresh
  // each time the editor opens, which is the only moment it is read. An effect
  // syncing them would also fight a title that changed underneath us.
  const open = () => {
    setDraft(title);
    setEditing(true);
  };

  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    // Put the caret at the end rather than selecting everything: the common
    // edit is appending a word, not replacing the whole title.
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);

  const save = async () => {
    const next = draft.trim();
    if (!next || next === title) {
      setEditing(false);
      setDraft(title);
      return;
    }
    setSaving(true);
    try {
      await issueApi.update(slug, issueKey, { title: next });
      setEditing(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to rename issue");
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="mb-3 flex items-start gap-1">
        <h1 className="min-w-0 text-title font-semibold tracking-[-0.01em] text-ink">
          {title}
        </h1>
        {/* Beside the heading rather than under it, and always drawn: an
            issue's title is read far more often than it is changed, so the
            control stays quiet, but it does not hide behind a pointer. */}
        <button
          type="button"
          onClick={open}
          aria-label="Rename this issue"
          className="mt-1.5 shrink-0 rounded-md p-1 text-mute transition-colors hover:bg-muted hover:text-ink"
        >
          <Pencil className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="mb-3 flex items-start gap-2">
      <textarea
        ref={inputRef}
        rows={1}
        value={draft}
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setDraft(title);
            setEditing(false);
          }
        }}
        // field-sizing lets the box grow with the text, so the heading stays a
        // heading instead of becoming a two-row box with a scrollbar.
        className="min-w-0 flex-1 resize-none rounded-sm border border-hairline bg-canvas px-2 py-1 text-title font-semibold tracking-[-0.01em] text-ink outline-none focus-visible:border-hairline-strong [field-sizing:content]"
      />
      <span className="mt-2 flex shrink-0 items-center gap-2 text-caption text-mute">
        {saving ? (
          <LoaderCircle className="size-3.5 animate-spin" />
        ) : (
          <kbd className="rounded border border-hairline bg-muted px-1.5 font-mono text-micro">
            ↵ to save
          </kbd>
        )}
      </span>
    </div>
  );
}
