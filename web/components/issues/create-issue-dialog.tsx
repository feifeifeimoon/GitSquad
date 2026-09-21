"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import {
  ISSUE_STATUSES,
  issueApi,
  type IssueStatus,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { MarkdownEditor } from "@/components/markdown-editor-lazy";
import { StatusIconLabel } from "@/components/status-icon";

/**
 * The board's create-issue dialog, owning the draft it edits.
 *
 * The draft lives here rather than on the board page so that typing a title
 * re-renders this dialog and nothing else — held by the page, every keystroke
 * repainted all seven columns and every card in them.
 *
 * The caller gives each opening a fresh `key`, so the lazy state below is the
 * whole reset: no close handler has to clear fields, and a draft abandoned by
 * pressing Escape does not come back on the next open.
 */
export function CreateIssueDialog({
  slug,
  workspaceName,
  open,
  initialStatus,
  onOpenChange,
  onCreated,
  mentionItems,
}: {
  slug: string;
  workspaceName: string;
  open: boolean;
  initialStatus: IssueStatus;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  mentionItems: string[];
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<IssueStatus>(initialStatus);
  const [creating, setCreating] = useState(false);

  const create = async () => {
    if (!title.trim()) return;
    setCreating(true);
    try {
      await issueApi.create(slug, { title, description, status });
      onOpenChange(false);
      onCreated();
      toast.success("Issue created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create issue");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[460px] max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogTitle className="sr-only">Create issue</DialogTitle>
        <div className="flex items-center gap-1.5 px-5 pr-12 pt-3 text-caption text-mute">
          <span className="truncate">{workspaceName}</span>
          <ChevronRight className="size-3 shrink-0 text-mute/50" />
          <span className="shrink-0 font-medium text-ink">Create issue</span>
        </div>
        <input
          autoFocus
          placeholder="Issue title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="px-5 pb-2 pt-3 text-lg font-semibold text-ink outline-none placeholder:text-mute"
        />
        <MarkdownEditor
          onChange={setDescription}
          placeholder="Describe the issue… (@mention an agent)"
          mentionItems={mentionItems}
          className="min-h-0 flex-1 overflow-y-auto px-5 py-3"
        />
        <div className="flex items-center justify-between border-t border-hairline px-4 py-3">
          <Select value={status} onValueChange={(v) => setStatus(v as IssueStatus)}>
            <SelectTrigger className="h-8 w-auto">
              <StatusIconLabel status={status} />
            </SelectTrigger>
            <SelectContent position="popper" sideOffset={4}>
              {ISSUE_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  <StatusIconLabel status={s} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button disabled={!title.trim() || creating} onClick={create}>
            Create issue
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
