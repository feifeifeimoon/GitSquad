"use client";

import { useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import {
  IssueDetail, IssueStatus, ISSUE_STATUSES, issueApi, agentApi, type Agent,
} from "@/lib/api";
import { paths } from "@/lib/paths";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select";
import { Markdown } from "@/components/markdown";
import { Field } from "@/components/form-field";
import { SectionHeading } from "@/components/page-header";
import { ErrorState } from "@/components/error-state";
import { CommentComposer } from "@/components/issues/comment-composer";
import { StatusIconLabel } from "@/components/status-icon";
import { IssuePullRequests } from "@/components/issues/issue-pull-requests";
import { TimeAgo } from "@/components/time-ago";
import { useApi } from "@/lib/query";

export default function IssueDetailPage() {
  const { slug, issueKey } = useParams<{ slug: string; issueKey: string }>();
  const router = useRouter();

  const { data: issue, loading, error, refresh } = useApi<IssueDetail>(
    `/api/v1/workspaces/${slug}/issues/${issueKey}`,
    () => issueApi.get(slug, issueKey),
  );
  const { data: agents } = useApi<Agent[]>(
    `/api/v1/workspaces/${slug}/agents`,
    () => agentApi.list(slug),
  );

  // Realtime needs no wiring: the shell holds the socket, and an event
  // invalidates this path, so a comment written elsewhere appears here without
  // a reload.
  const agentNames = useMemo(
    () => (agents ?? []).filter((a) => a.enabled).map((a) => a.name),
    [agents],
  );

  const changeStatus = async (status: IssueStatus) => {
    if (!issue || status === issue.status) return;
    try {
      await issueApi.update(slug, issueKey, { status });
      refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update status",
      );
    }
  };

  if (error) {
    return (
      <div className="p-8">
        <ErrorState
          what="issue"
          error={error}
          onRetry={refresh}
          notFoundHref={paths.workspace(slug).board()}
          notFoundLabel="Back to the board"
        />
      </div>
    );
  }

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
      {/* Breadcrumb — a path, so it stays quiet and leaves the title to the
          heading in the column below. */}
      <div className="flex items-center gap-1.5 border-b border-hairline px-8 py-4">
        <button
          onClick={() => router.push(paths.workspace(slug).board())}
          className="shrink-0 text-label text-body transition-colors hover:text-ink"
        >
          Issues
        </button>
        <ChevronRight className="size-3.5 shrink-0 text-mute" />
        <span className="truncate text-label text-mute">{issue.issue_key}</span>
      </div>

      {/* Two-column body */}
      <div className="flex min-h-0 flex-1">
        {/* Main column */}
        <div className="min-w-0 flex-1 overflow-y-auto px-8 py-6">
          {/* The title is the page's one loud element; the breadcrumb above it
              is navigation and stays quiet. */}
          <h1 className="mb-3 text-title font-semibold tracking-[-0.01em] text-ink">
            {issue.title}
          </h1>

          {issue.description ? (
            <div className="mb-8">
              <Markdown>{issue.description}</Markdown>
            </div>
          ) : (
            <p className="mb-8 text-copy text-mute">No description.</p>
          )}

          {/* Activity */}
          <SectionHeading className="mb-4">Activity</SectionHeading>
          <div className="space-y-5">
            {issue.comments.map((c) => (
              <div key={c.id} className="flex gap-3">
                <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-canvas-soft-2 text-caption font-medium text-body">
                  {c.type === "comment"
                    ? (c.author_name[0] ?? "?").toUpperCase()
                    : "·"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-copy font-medium text-ink">
                      {c.type === "system" ? "System" : c.author_name}
                    </span>
                    {/* Relative, not absolute: an activity feed is read as a
                        sequence, and the exact second is one hover away. */}
                    <TimeAgo
                      iso={c.created_at}
                      className="text-caption text-mute"
                    />
                    {c.type !== "comment" && (
                      <Badge variant="secondary">{c.type}</Badge>
                    )}
                  </div>
                  <div className="mt-1.5 text-copy text-body">
                    <Markdown>{c.content}</Markdown>
                  </div>
                </div>
              </div>
            ))}
            {issue.comments.length === 0 && (
              <p className="text-copy text-mute">No activity yet.</p>
            )}
          </div>

          {/* Comment composer */}
          <div className="mt-8">
            <CommentComposer
              slug={slug}
              issueKey={issueKey}
              mentionItems={agentNames}
              onPosted={refresh}
            />
          </div>
        </div>

        {/* Right sidebar */}
        <div className="w-64 shrink-0 overflow-y-auto border-l border-hairline px-5 py-6">
          <SectionHeading className="mb-4">Details</SectionHeading>
          <div className="space-y-5">
            <Field label="Status">
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
            </Field>

            <Field label="Assignee">
              {issue.assigned_agents.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {issue.assigned_agents.map((a) => (
                    <Badge key={a} variant="outline">{a}</Badge>
                  ))}
                </div>
              ) : (
                <p className="text-copy text-body">Unassigned</p>
              )}
            </Field>

            <Field label="Creator">
              <p className="text-copy text-body">{issue.creator_name || "—"}</p>
            </Field>

            <IssuePullRequests slug={slug} issue={issue} onChange={refresh} />

            <Field label="Created">
              <p className="font-mono text-copy text-body">
                {new Date(issue.created_at).toLocaleString()}
              </p>
            </Field>
          </div>
        </div>
      </div>
    </div>
  );
}
