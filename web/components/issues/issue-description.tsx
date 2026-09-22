"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { issueApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/markdown";
import { MarkdownEditor } from "@/components/markdown-editor-lazy";

/**
 * The issue's description, editable where it is.
 *
 * It was read-only, which made it write-once: `issueApi.update` has always
 * accepted a description and no page ever sent one, so the only moment a
 * description could exist was the create dialog. Both references treat the
 * description as the page's main editing surface rather than as a rendered
 * artefact.
 *
 * Clicking the prose opens the editor, and the caret lands in it — the gesture
 * Linear teaches and multica implements: the block is text until you click it,
 * and then it is where you type. A drag-selection is the one click that means
 * something else (copying a sentence out), so it is left alone; a link is the
 * other, and it navigates.
 *
 * An empty description keeps a visible control, because there is nothing to
 * click on yet. Once there is, the affordance drops to a pencil that appears on
 * hover or focus — kept for the keyboard, not drawn as a label under the prose.
 */
export function IssueDescription({
  slug,
  issueKey,
  description,
  mentionItems,
  onSaved,
}: {
  slug: string;
  issueKey: string;
  description: string;
  mentionItems: string[];
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(description);
  const [saving, setSaving] = useState(false);

  const open = () => {
    setDraft(description);
    setEditing(true);
  };

  const save = async () => {
    if (draft === description) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await issueApi.update(slug, issueKey, { description: draft });
      setEditing(false);
      onSaved();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save the description",
      );
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="mb-8 overflow-hidden rounded-lg border border-hairline bg-canvas">
        <MarkdownEditor
          content={description}
          onChange={setDraft}
          // Clicking the prose is meant to land the caret in it: the editor
          // mounts on that click, so it has to take the focus itself.
          autoFocus
          ariaLabel="Issue description"
          placeholder="Describe the issue… (@mention an agent)"
          mentionItems={mentionItems}
          className="min-h-[140px] px-3 py-2"
        />
        <div className="flex items-center justify-end gap-2 border-t border-hairline px-3 py-2">
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => setEditing(false)}
          >
            Cancel
          </Button>
          <Button disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    );
  }

  if (!description) {
    return (
      <div className="mb-8">
        {/* Quiet, not outlined: an empty description is a slot waiting to be
            filled, and a bordered button under the title reads as the page's
            primary action instead. */}
        <Button
          variant="ghost"
          size="sm"
          onClick={open}
          className="-ml-2 text-mute hover:text-ink"
        >
          <Pencil className="size-3.5" />
          Add a description
        </Button>
      </div>
    );
  }

  return (
    <section className="group mb-8">
      <div
        onClick={(event) => {
          // Selecting a sentence to copy it is not a request to edit the block.
          const selection = window.getSelection();
          if (selection && !selection.isCollapsed) return;
          // A link in the prose is a link.
          if ((event.target as HTMLElement).closest("a")) return;
          open();
        }}
        className="cursor-text"
      >
        <Markdown>{description}</Markdown>
      </div>
      {/* Revealed on hover or focus: the prose above is the control now, and
          this is what makes the same edit reachable from the keyboard. */}
      <div className="mt-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={open}
          aria-label="Edit description"
          className="-ml-1.5 text-mute hover:text-ink"
        >
          <Pencil className="size-3.5" />
        </Button>
      </div>
    </section>
  );
}
