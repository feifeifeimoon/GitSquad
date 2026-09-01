"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MessageSquare,
  Plus,
  Circle,
  CircleDashed,
  CircleDot,
  Eye,
  CheckCircle2,
  Ban,
  CircleX,
  type LucideIcon,
} from "lucide-react";
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

const COLUMN_BG: Record<IssueStatus, string> = {
  backlog: "bg-muted/40",
  todo: "bg-muted/40",
  in_progress: "bg-warning-soft",
  in_review: "bg-violet-soft",
  done: "bg-cyan-soft",
  blocked: "bg-error-soft",
  cancelled: "bg-muted/40",
};

const STATUS_ICON: Record<IssueStatus, { icon: LucideIcon; className: string }> = {
  backlog: { icon: CircleDashed, className: "text-mute" },
  todo: { icon: Circle, className: "text-mute" },
  in_progress: { icon: CircleDot, className: "text-warning" },
  in_review: { icon: Eye, className: "text-violet" },
  done: { icon: CheckCircle2, className: "text-cyan-deep" },
  blocked: { icon: Ban, className: "text-destructive" },
  cancelled: { icon: CircleX, className: "text-mute" },
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
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
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
                <Textarea
                  placeholder="Description — markdown supported"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="min-h-[100px]"
                />
                <div className="mt-2 max-h-48 overflow-y-auto rounded-md border border-hairline bg-canvas-soft p-3">
                  {description.trim() ? (
                    <Markdown>{description}</Markdown>
                  ) : (
                    <span className="text-sm text-mute">Live preview</span>
                  )}
                </div>
              </div>
              <Button disabled={!title.trim() || creating} onClick={create} className="w-full">
                Create
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
          );
        })}
      </div>
    </div>
  );
}
