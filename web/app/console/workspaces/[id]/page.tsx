"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, ChevronRight } from "lucide-react";
import {
  Issue, IssueStatus, ISSUE_STATUSES, ISSUE_STATUS_LABELS, issueApi, api, Workspace,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select";
import { MarkdownEditor } from "@/components/markdown-editor";
import { STATUS_ICON, StatusIconLabel } from "@/components/status-icon";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const COLUMN_BG: Record<IssueStatus, string> = {
  backlog: "bg-muted/40",
  todo: "bg-muted/40",
  in_progress: "bg-warning-soft",
  in_review: "bg-violet-soft",
  done: "bg-cyan-soft",
  blocked: "bg-error-soft",
  cancelled: "bg-muted/40",
};

export default function WorkspaceBoardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<IssueStatus>("backlog");
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

  useEffect(() => {
    api
      .get<Workspace>(`/api/v1/workspaces/${id}`)
      .then(setWorkspace)
      .catch(() => {});
  }, [id]);

  const create = async () => {
    if (!title.trim()) return;
    setCreating(true);
    try {
      await issueApi.create(id, { title, description, status });
      setTitle("");
      setDescription("");
      setStatus("backlog");
      setOpen(false);
      load();
    } finally {
      setCreating(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setTitle("");
      setDescription("");
      setStatus("backlog");
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
      <div className="flex items-center justify-end px-8 pb-4 pt-6">
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" />
              New Issue
            </Button>
          </DialogTrigger>
          <DialogContent className="flex h-[460px] max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
            <DialogTitle className="sr-only">Create issue</DialogTitle>
            <div className="flex items-center gap-1.5 px-5 pr-12 pt-3 text-xs text-mute">
              <span className="truncate">{workspace?.name ?? "Workspace"}</span>
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
              placeholder="Describe the issue…"
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
      </div>

      <div className="flex flex-1 gap-4 overflow-x-auto p-8">
        {ISSUE_STATUSES.map((status) => {
          const Icon = STATUS_ICON[status].icon;
          return (
            <div
              key={status}
              className={`flex min-h-full w-72 shrink-0 flex-col rounded-xl border ${COLUMN_BG[status]}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (draggingId) move(draggingId, status);
                setDraggingId(null);
              }}
            >
              <div className="flex items-center gap-2 px-3 py-2">
                <Icon className={`size-3.5 ${STATUS_ICON[status].className}`} />
                <span className="text-sm font-medium">{ISSUE_STATUS_LABELS[status]}</span>
                <span className="text-xs tabular-nums text-mute">{byStatus(status).length}</span>
              </div>
              <div className="flex flex-1 flex-col gap-2 p-2">
                {byStatus(status).map((issue) => (
                  <div
                    key={issue.id}
                    draggable
                    onDragStart={() => setDraggingId(issue.id)}
                    onClick={() => router.push(`/console/workspaces/${id}/issues/${issue.id}`)}
                    className="cursor-pointer rounded-lg border bg-card p-3 transition-shadow hover:shadow-md"
                  >
                    <p className="line-clamp-2 text-sm font-medium text-ink">{issue.title}</p>
                    {issue.description ? (
                      <p className="mt-1 line-clamp-1 text-xs text-body">{issue.description}</p>
                    ) : (
                      <p className="mt-1 text-xs text-mute">No description</p>
                    )}
                    <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-body">
                        {issue.assigned_agents.length > 0
                          ? issue.assigned_agents.join(", ")
                          : "未分配"}
                      </span>
                      <span className="shrink-0 text-mute">{timeAgo(issue.updated_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
