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
 * Editing is explicit rather than click-anywhere: a description is prose you
 * also want to select and copy, and a click that silently turns prose into an
 * editor breaks that. The pencil is the affordance; the block itself stays
 * text.
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
    <section className="mb-8">
      <Markdown>{description}</Markdown>
      {/* Visible rather than hover-revealed: a control that appears only under
          a pointer does not exist on a touch screen. */}
      <div className="mt-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={open}
          className="-ml-2 text-mute hover:text-ink"
        >
          <Pencil className="size-3.5" />
          Edit description
        </Button>
      </div>
    </section>
  );
}
