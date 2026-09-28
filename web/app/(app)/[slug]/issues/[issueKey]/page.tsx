"use client";

import { useEffect, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  IssueDetail, IssueStatus, ISSUE_STATUSES, issueApi, agentApi, type Agent,
} from "@/lib/api";
import { paths } from "@/lib/paths";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select";
import { SectionHeading } from "@/components/page-header";
import { AgentPicker } from "@/components/issues/agent-picker";
import { AssigneePicker } from "@/components/issues/assignee-picker";
import { CommentComposer } from "@/components/issues/comment-composer";
import { IssueActions } from "@/components/issues/issue-actions";
import { IssueDescription } from "@/components/issues/issue-description";
import { IssueTimeline } from "@/components/issues/issue-timeline";
import { IssueTitle } from "@/components/issues/issue-title";
import { ROW_TRIGGER } from "@/components/issues/property-row";
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
        <div className="flex-1 overflow-y-auto lg:flex lg:min-h-0 lg:flex-col lg:overflow-hidden">
          <div className="mx-auto flex w-full max-w-5xl flex-col px-8 py-8 lg:min-h-0 lg:flex-1">
            {/* The read-only row and the title below it, the shape the loaded
                page uses, so the two columns do not shift when it arrives. */}
            <div className="shrink-0 border-b border-hairline pb-4">
              <Skeleton className="h-5 w-3/5" />
            </div>
            <div className="mt-6 grid grid-cols-1 gap-y-8 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,42rem)_15rem] lg:gap-x-12">
              <div className="min-w-0 lg:min-h-0 lg:overflow-y-auto">
                <Skeleton className="mb-5 h-8 w-4/5" />
                <div className="space-y-2">
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
              <div className="min-w-0 lg:min-h-0 lg:overflow-y-auto">
                <Skeleton className="h-6 w-14" />
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
      {/* The page is a panel, not a document with chrome: the issue's own row,
          then the issue beside the facts about it. There is no breadcrumb —
          Linear and multica both name the issue by key and title in one line
          (`GS-1 Fix the thing`) rather than spending a row on the path to it,
          and the sidebar is already the way back to the board.

          From `lg` the panel is fixed at the top and on the right: the title
          row stays put and each column scrolls on its own, so only the thread
          moves. `sticky` alone could not do this. A sticky rail can only travel
          *inside its own grid row*, so it stopped the moment that row ended and
          left the screen with the content — which is what "the rail is not
          fixed" looked like from the reader's side — and a sticky title would
          have been a second scroll container's worth of new problems for a row
          that is already outside the moving part. Below `lg` there is one
          column and one scroll: a document, which is what a phone-width issue
          is.

          One capped block for the whole page, so the title, the prose and the
          rail all share a left edge. Left uncapped, the gutter between the two
          columns was the only thing on the page that grew with the window —
          68px at 1280, 557px at 1920, 1197px at 2560 — and the two halves read
          as unrelated. */}
      <div className="flex-1 overflow-y-auto lg:flex lg:min-h-0 lg:flex-col lg:overflow-hidden">
        <div className="mx-auto flex w-full max-w-5xl flex-col px-8 py-8 lg:min-h-0 lg:flex-1">
          {/* The read-only first row, and the panel's only chrome: the issue
              named the way multica's header leaf names it — `identifier title`,
              one run of text, one space between them, `font-medium` — and the
              way Linear names it too. The key is not a badge or a mono prefix
              here: setting it in another font made two things of one name, and
              the name is what has to be readable once the thread has scrolled.
              It is *not* the editable copy: the title the reader changes is the
              body's first element, the same words once as a label and once as
              the thing itself. */}
          <div className="shrink-0 truncate border-b border-hairline pb-4 text-copy font-medium text-ink">
            {issue.issue_key} {issue.title}
          </div>

          {/* Two columns under the title: the issue on the left, the facts
              about it on the right. The left track *is* the reading measure —
              42rem, ~48 characters a line — and the two tracks plus a 48px
              gutter are the whole block: 42 + 3 + 15 = 60rem of content, which
              is `max-w-5xl` (64rem) less the container's own `px-8`. Capping at
              the content width instead also shrinks the prose track, since the
              tracks are a fixed 42rem and the padding comes out of the same
              box. */}
          <div className="mt-6 grid grid-cols-1 gap-y-8 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,42rem)_15rem] lg:gap-x-12">
            {/* The thread is the thing that scrolls, and it owns the ref the
                activity rail measures against: the rail is the scroll viewport's
                minimap, so the viewport has to be this box now. */}
            <div
              ref={scrollerRef}
              className="min-w-0 lg:min-h-0 lg:overflow-y-auto"
            >
              {/* The issue's own title, at display size and editable where it
                  is read — the body's first element, so it is what the page
                  opens on and what the thread is below. 20px under it is
                  multica's `mt-5` before its description. */}
              <div className="mb-5">
                <IssueTitle
                  slug={slug}
                  issueKey={issueKey}
                  title={issue.title}
                  onSaved={refresh}
                />
              </div>

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

            {/* Fixed against the thread, not sticky inside it: this column
                never moves, and scrolls on its own only when the facts are
                taller than the window. */}
            <aside className="min-w-0 lg:min-h-0 lg:overflow-y-auto">
              {/* "Properties", not "Details": those two words are not synonyms
                  in the tools this page is modelled on. multica keeps
                  `Properties` for the fields you set — status, assignee,
                  priority, dates — and spends `Details` on the immutable
                  provenance (created by, created, updated), which its own notes
                  call the least-read block in the sidebar. This rail is mostly
                  the first kind, so it takes the first word; the creator and
                  the two timestamps at the bottom are the second kind, and
                  would be a `Details` group of their own if they ever need to
                  be named. */}
              <SectionHeading
                className="mb-4"
                // The rail's own corner, and pinned with it: what you can do to
                // the issue sits at the top of what the issue *is*, above the
                // facts rather than among them, and stays on screen while the
                // thread scrolls past.
                actions={
                  <IssueActions issueKey={issue.issue_key} url={url} />
                }
              >
                Properties
              </SectionHeading>
              <div className="space-y-5">
                <Field label="Status">
                  <Select
                    value={issue.status}
                    onValueChange={(v) => changeStatus(v as IssueStatus)}
                  >
                    {/* The same row grammar as Assignee and Agents below: the
                        whole row is the control, and nothing draws a box. */}
                    <SelectTrigger className={cn(ROW_TRIGGER, "justify-between border-0")}>
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

                {/* One person accountable, then the agents doing the work: two
                    axes, because a set of names could never answer "who owns
                    this". */}
                <Field label="Assignee">
                  <AssigneePicker
                    slug={slug}
                    issueKey={issueKey}
                    assignee={issue.assignee}
                    onSaved={refresh}
                  />
                </Field>

                <Field label="Agents">
                  <AgentPicker
                    slug={slug}
                    issueKey={issueKey}
                    agents={issue.agents}
                    onSaved={refresh}
                  />
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
