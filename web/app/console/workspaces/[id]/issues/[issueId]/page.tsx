"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  IssueDetail, IssueStatus, ISSUE_STATUSES, issueApi,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select";
import { Markdown } from "@/components/markdown";
import { MarkdownEditor } from "@/components/markdown-editor";
import { StatusIconLabel } from "@/components/status-icon";

export default function IssueDetailPage() {
  const { id, issueId } = useParams<{ id: string; issueId: string }>();
  const router = useRouter();
  const [issue, setIssue] = useState<IssueDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [posting, setPosting] = useState(false);
  const [editorKey, setEditorKey] = useState(0);

  const load = () => {
    issueApi
      .get(id, issueId)
      .then(setIssue)
      .catch(() => router.push(`/console/workspaces/${id}`))
      .finally(() => setLoading(false));
  };
  useEffect(load, [id, issueId, router]);

  const changeStatus = async (status: IssueStatus) => {
    if (!issue || status === issue.status) return;
    await issueApi.update(id, issueId, { status });
    load();
  };

  const post = async () => {
    if (!content.trim()) return;
    setPosting(true);
    try {
      await issueApi.addComment(id, issueId, content);
      setContent("");
      setEditorKey((k) => k + 1);
      load();
    } finally {
      setPosting(false);
    }
  };

  if (loading || !issue) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-1.5 border-b border-hairline px-8 py-4">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1 px-8 py-6">
            <Skeleton className="h-6 w-3/4" />
            <div className="mt-4 space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
              <Skeleton className="h-3 w-2/3" />
            </div>
            <Skeleton className="mt-8 h-4 w-20" />
            <div className="mt-3 space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="size-6 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-16 w-full rounded-lg" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="w-64 shrink-0 border-l border-hairline px-5 py-6">
            <Skeleton className="h-3 w-14" />
            <div className="mt-5 space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-5 w-28" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 border-b border-hairline px-8 py-4">
        <button
          onClick={() => router.push(`/console/workspaces/${id}`)}
          className="flex shrink-0 items-center gap-1 text-sm text-body transition-colors hover:text-ink"
        >
          <ChevronLeft className="size-4" />
          Issues
        </button>
        <ChevronRight className="size-3.5 shrink-0 text-mute" />
        <span className="shrink-0 font-mono text-sm text-body">{issue.issue_key}</span>
        <ChevronRight className="size-3.5 shrink-0 text-mute" />
        <span className="truncate text-sm font-medium text-ink">{issue.title}</span>
      </div>

      {/* Two-column body */}
      <div className="flex min-h-0 flex-1">
        {/* Main column */}
        <div className="min-w-0 flex-1 overflow-y-auto px-8 py-6">
          {issue.description ? (
            <div className="mb-8">
              <Markdown>{issue.description}</Markdown>
            </div>
          ) : (
            <p className="mb-8 text-sm text-mute">No description.</p>
          )}

          {/* Activity */}
          <h2 className="mb-3 text-sm font-medium text-ink">Activity</h2>
          <div className="space-y-4">
            {issue.comments.map((c) => (
              <div key={c.id} className="flex gap-3">
                <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-body">
                  {c.type === "comment"
                    ? (c.author_name[0] ?? "?").toUpperCase()
                    : "·"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-medium text-ink">
                      {c.type === "system" ? "System" : c.author_name}
                    </span>
                    <span className="text-mute">
                      {new Date(c.created_at).toLocaleString()}
                    </span>
                    {c.type !== "comment" && (
                      <Badge variant="secondary">{c.type}</Badge>
                    )}
                  </div>
                  <div className="mt-1 text-sm text-body">
                    <Markdown>{c.content}</Markdown>
                  </div>
                </div>
              </div>
            ))}
            {issue.comments.length === 0 && (
              <p className="text-sm text-mute">No activity yet.</p>
            )}
          </div>

          {/* Comment composer */}
          <div className="mt-8 overflow-hidden rounded-lg border border-hairline bg-canvas">
            <MarkdownEditor
              key={editorKey}
              onChange={setContent}
              placeholder="Add a comment… (@mention an agent)"
              className="min-h-[100px] px-3 py-2"
            />
            <div className="flex items-center justify-end border-t border-hairline px-3 py-2">
              <Button disabled={!content.trim() || posting} onClick={post}>
                {posting ? "Posting…" : "Comment"}
              </Button>
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="w-64 shrink-0 overflow-y-auto border-l border-hairline px-5 py-6">
          <h2 className="mb-4 text-xs font-medium uppercase text-mute">Details</h2>
          <div className="space-y-5">
            <div>
              <label className="mb-1.5 block text-xs text-mute">Status</label>
              <Select
                value={issue.status}
                onValueChange={(v) => changeStatus(v as IssueStatus)}
              >
                <SelectTrigger className="h-8 w-full">
                  <StatusIconLabel status={issue.status} />
                </SelectTrigger>
                <SelectContent position="popper" sideOffset={4}>
                  {ISSUE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      <StatusIconLabel status={s} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs text-mute">Assignee</label>
              {issue.assigned_agents.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {issue.assigned_agents.map((a) => (
                    <Badge key={a} variant="outline">{a}</Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-body">Unassigned</p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-xs text-mute">Creator</label>
              <p className="text-sm text-body">{issue.creator_name || "—"}</p>
            </div>

            <div>
              <label className="mb-1.5 block text-xs text-mute">Created</label>
              <p className="font-mono text-sm text-body">
                {new Date(issue.created_at).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
