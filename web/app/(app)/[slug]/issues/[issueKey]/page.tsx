"use client";

import { useEffect, useMemo, useRef } from "react";
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
import { SectionHeading } from "@/components/page-header";
import { CommentComposer } from "@/components/issues/comment-composer";
import { IssueActions } from "@/components/issues/issue-actions";
import { IssueDescription } from "@/components/issues/issue-description";
import { IssueTimeline } from "@/components/issues/issue-timeline";
import { IssueTitle } from "@/components/issues/issue-title";
import { StatusIconLabel } from "@/components/status-icon";
import { IssuePullRequests } from "@/components/issues/issue-pull-requests";
import { TimeAgo } from "@/components/time-ago";
import { useApi } from "@/lib/query";

export default function IssueDetailPage() {
  const { slug, issueKey } = useParams<{ slug: string; issueKey: string }>();
  const router = useRouter();
  // The feed's rail measures against the thing that scrolls, so the scroller
  // is the page's to own and the timeline's to read.
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const { data: issue, loading, error, refresh } = useApi<IssueDetail>(
    `/api/v1/workspaces/${slug}/issues/${issueKey}`,
    () => issueApi.get(slug, issueKey),
  );
  const { data: agents } = useApi<Agent[]>(
    `/api/v1/workspaces/${slug}/agents`,
    () => agentApi.list(slug),
  );

  // A failed read here means the issue is gone or not ours; the board is the
  // place to be. `lib/api.ts` already cleared the token if it was a 401.
  useEffect(() => {
    if (error) router.push(paths.workspace(slug).board());
  }, [error, router, slug]);

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

  if (loading || !issue) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-5xl px-8">
            <div className="flex items-center gap-1.5 border-b border-hairline py-4">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="grid grid-cols-1 gap-10 py-6 lg:grid-cols-[minmax(0,1fr)_15rem]">
              <div className="min-w-0">
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
              <div className="min-w-0">
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
        </div>
      </div>
    );
  }

  // Read once and shared by the copy actions; the origin is only known in the
  // browser, so it is computed during render like the settings page does.
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}${paths.workspace(slug).issue(issueKey)}`
      : "";

  return (
    <div className="flex h-full flex-col">
      {/* The whole page scrolls as one — the header row and the body are the
          same container, not a full-width bar above a centred column. They were
          two different left edges, which is what "it does not look centred"
          actually was: on a wide screen the breadcrumb started 50px left of the
          title it belongs to. */}
      <div ref={scrollerRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-8">
          {/* Breadcrumb — a path, so it stays quiet and leaves the title to the
              heading below. The key is mono here because it is an identifier,
              and the only one on the page. */}
          <div className="flex items-center gap-1.5 border-b border-hairline py-4">
            <button
              onClick={() => router.push(paths.workspace(slug).board())}
              className="shrink-0 text-label text-body transition-colors hover:text-ink"
            >
              Issues
            </button>
            <ChevronRight className="size-3.5 shrink-0 text-mute" />
            <span className="truncate font-mono text-label text-mute">
              {issue.issue_key}
            </span>
            {/* The corner the eye already reads as "actions on this thing". */}
            <div className="ml-auto flex shrink-0 items-center pl-2">
              <IssueActions issueKey={issue.issue_key} url={url} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-10 py-6 lg:grid-cols-[minmax(0,1fr)_15rem]">
            <div className="min-w-0">
              <IssueTitle
                slug={slug}
                issueKey={issueKey}
                title={issue.title}
                onSaved={refresh}
              />

              <IssueDescription
                slug={slug}
                issueKey={issueKey}
                description={issue.description}
                mentionItems={agentNames}
                onSaved={refresh}
              />

              <SectionHeading className="mb-3">Activity</SectionHeading>
              <IssueTimeline
                comments={issue.comments}
                scrollerRef={scrollerRef}
              />

              {/* Docked to the bottom of the scroll viewport once the thread is
                  taller than it — multica does the same, behind a preference.
                  `sticky bottom-0` asks for exactly that rule with no threshold
                  to tune: it does nothing at all until the composer's place is
                  below the fold, which is the same thing as "there are enough
                  comments to scroll past". The band is opaque because the
                  comments run underneath it. */}
              <div className="sticky bottom-0 mt-8 bg-page pb-2 pt-4">
                {/* Keyed by the issue: the composer holds a draft, and the
                    route can swap the issue underneath it without unmounting. */}
                <CommentComposer
                  key={issueKey}
                  slug={slug}
                  issueKey={issueKey}
                  mentionItems={agentNames}
                  onPosted={refresh}
                />
              </div>
            </div>

            <aside className="min-w-0 lg:sticky lg:top-6 lg:self-start">
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
                        <Badge key={a} variant="outline">
                          @{a}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-copy text-body">Unassigned</p>
                  )}
                </Field>

                <Field label="Creator">
                  <p className="text-copy text-body">
                    {issue.creator_name || "—"}
                  </p>
                </Field>

                <IssuePullRequests slug={slug} issue={issue} onChange={refresh} />

                <Field label="Created">
                  <TimeAgo
                    iso={issue.created_at}
                    className="text-copy text-body"
                  />
                </Field>

                {/* The board card leads with this and the page did not show it
                    at all, which is the wrong way round: the question "has
                    anything happened since I looked" belongs here. */}
                <Field label="Updated">
                  <TimeAgo
                    iso={issue.updated_at}
                    className="text-copy text-body"
                  />
                </Field>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A labelled value in the rail. Local because the rail is not a form. */
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 text-caption text-mute">{label}</p>
      {children}
    </div>
  );
}
