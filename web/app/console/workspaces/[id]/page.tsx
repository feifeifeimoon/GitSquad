"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Plus } from "lucide-react";
import {
  Issue, IssueStatus, ISSUE_STATUSES, ISSUE_STATUS_LABELS, issueApi,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/markdown";
import { cn } from "@/lib/utils";

const STATUS_BG: Record<IssueStatus, string> = {
  backlog: "bg-muted",
  todo: "bg-canvas",
  in_progress: "bg-warning-soft",
  in_review: "bg-violet-soft",
  done: "bg-cyan-soft",
  blocked: "bg-error-soft",
  cancelled: "bg-muted",
};

export default function WorkspaceBoardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [preview, setPreview] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const load = () => {
    issueApi
      .list(id)
      .then(setIssues)
      .catch(() => router.push("/console/workspaces"))
      .finally(() => setLoading(false));
  };
  useEffect(load, [id, router]);

  const create = async () => {
    if (!title.trim()) return;
    setCreating(true);
    try {
      await issueApi.create(id, { title, description });
      setTitle("");
      setDescription("");
      load();
    } finally {
      setCreating(false);
    }
  };

  const move = async (issueId: string, status: IssueStatus) => {
    setIssues((prev) =>
      prev.map((i) => (i.id === issueId ? { ...i, status } : i))
    );
    try {
      await issueApi.update(id, issueId, { status });
    } catch {
      load(); // revert to server truth on failure
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const byStatus = (s: IssueStatus) =>
    issues.filter((i) => i.status === s);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-8 pb-4 pt-6">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs tabular-nums text-mute">
            {issues.length}
          </span>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" />
              New Issue
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Issue</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input
                placeholder="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <div>
                <div className="mb-1 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPreview(false)}
                    className={cn(
                      "rounded-sm px-2 py-1 text-xs transition-colors",
                      !preview ? "bg-muted font-medium text-ink" : "text-body hover:text-ink",
                    )}
                  >
                    Write
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreview(true)}
                    className={cn(
                      "rounded-sm px-2 py-1 text-xs transition-colors",
                      preview ? "bg-muted font-medium text-ink" : "text-body hover:text-ink",
                    )}
                  >
                    Preview
                  </button>
                </div>
                {preview ? (
                  <div className="min-h-[120px] rounded-md border border-hairline p-3">
                    {description.trim() ? (
                      <Markdown>{description}</Markdown>
                    ) : (
                      <span className="text-sm text-mute">Nothing to preview</span>
                    )}
                  </div>
                ) : (
                  <Textarea
                    placeholder="Description — markdown supported"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="min-h-[120px]"
                  />
                )}
              </div>
              <Button disabled={!title.trim() || creating} onClick={create} className="w-full">
                Create
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-1 gap-4 overflow-x-auto p-8">
        {ISSUE_STATUSES.map((status) => (
          <div
            key={status}
            className="flex min-h-full w-72 shrink-0 flex-col rounded-xl border bg-muted/30"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (draggingId) move(draggingId, status);
              setDraggingId(null);
            }}
          >
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-sm font-medium">{ISSUE_STATUS_LABELS[status]}</span>
              <Badge variant="secondary">{byStatus(status).length}</Badge>
            </div>
            <div className="flex flex-1 flex-col gap-2 p-2">
              {byStatus(status).map((issue) => (
                <div
                  key={issue.id}
                  draggable
                  onDragStart={() => setDraggingId(issue.id)}
                  onClick={() => router.push(`/console/workspaces/${id}/issues/${issue.id}`)}
                  className={`cursor-pointer rounded-lg border p-3 transition-shadow hover:shadow-md ${STATUS_BG[issue.status]}`}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs text-body">{issue.issue_key}</span>
                    <span className="flex items-center gap-1 text-xs text-body">
                      <MessageSquare className="size-3" />
                      {issue.comments_count ?? 0}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-sm font-medium">{issue.title}</p>
                  {issue.assigned_agents.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {issue.assigned_agents.map((a) => (
                        <Badge key={a} variant="outline">{a}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
