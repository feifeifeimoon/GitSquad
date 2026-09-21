"use client";

import { useState } from "react";
import { toast } from "sonner";
import { issueApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { MarkdownEditor } from "@/components/markdown-editor-lazy";

/**
 * The issue page's comment box, owning the text being written.
 *
 * Like the create dialog, the draft stays inside the component that edits it:
 * held by the page, every keystroke re-parsed the markdown of every comment in
 * the activity feed above it.
 */
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
  const [content, setContent] = useState("");
  const [posting, setPosting] = useState(false);
  // The editor is uncontrolled, so clearing the draft is a remount.
  const [editorKey, setEditorKey] = useState(0);

  const post = async () => {
    if (!content.trim()) return;
    setPosting(true);
    try {
      await issueApi.addComment(slug, issueKey, content);
      setContent("");
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

  return (
    <div className="overflow-hidden rounded-lg border border-hairline bg-canvas">
      <MarkdownEditor
        key={editorKey}
        onChange={setContent}
        placeholder="Add a comment… (@mention an agent)"
        mentionItems={mentionItems}
        className="min-h-[100px] px-3 py-2"
      />
      <div className="flex items-center justify-end border-t border-hairline px-3 py-2">
        <Button disabled={!content.trim() || posting} onClick={post}>
          {posting ? "Posting…" : "Comment"}
        </Button>
      </div>
    </div>
  );
}
