"use client";

import { use, useEffect, useMemo } from "react";
import Link from "next/link";
import { ExternalLink, Lock } from "lucide-react";
import {
  Agent,
  agentApi,
  api,
  Issue,
  ISSUE_STATUS_LABELS,
  issueApi,
  Workspace,
} from "@/lib/api";
import { invalidateApi, useApi } from "@/lib/query";
import { paths } from "@/lib/paths";
import {
  AGENT_REFRESH_MS,
  agentStatus,
  STATUS_DOT,
  type AgentStatus,
} from "@/lib/agent-status";
import {
  activeIssues,
  agentRoster,
  agentSummary,
  issueMix,
  landedIssues,
  overviewStats,
  repoLabel,
  repoUrl,
  weeklyCreated,
} from "@/lib/overview";
import { AgentHead } from "@/components/agents/agent-head";
import { AgentStatusBadge } from "@/components/status-dot";
import { ErrorState } from "@/components/error-state";
import { GitHubMark } from "@/components/github-mark";
import { STATUS_TONE, StatusIcon } from "@/components/status-icon";
import { TimeAgo } from "@/components/time-ago";
import { WorkspaceAvatar } from "@/components/workspace-avatar";
import { AgentStack } from "@/components/issues/agent-chip";
import { IssuePullRequestBadge } from "@/components/issues/issue-pull-requests";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * A workspace's front page: what it is and what is happening in it right now.
 *
 * It reads the same three endpoints the board, the roster and the settings page
 * read — no aggregate endpoint — because the overview is a view of that data,
 * not another copy of it. Everything that needs deciding (what counts as open,
 * what is "in flight", how the week's intake split across days, which agents
 * are enabled) lives in lib/overview.ts and is unit-tested; this file is layout.
 *
 * The page is one hairline-divided panel: identity, four readouts, then a main
 * column of work and a rail that answers "what is this / what is the mix / who
 * is on it". The rail is a fixed 20rem because a one-third column is too wide
 * to read as a rail on the screens this console is used on.
 */
export default function WorkspaceOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);

  const {
    data: workspace,
    loading: workspaceLoading,
    error: workspaceError,
    refresh: refreshWorkspace,
  } = useApi<Workspace>(`/api/v1/workspaces/${slug}`, () =>
    api.get<Workspace>(`/api/v1/workspaces/${slug}`),
  );
  const {
    data: issues,
    loading: issuesLoading,
    error: issuesError,
    refresh: refreshIssues,
  } = useApi<Issue[]>(`/api/v1/workspaces/${slug}/issues`, () =>
    issueApi.list(slug),
  );
  const {
    data: agents,
    loading: agentsLoading,
    error: agentsError,
    refresh: refreshAgents,
  } = useApi<Agent[]>(`/api/v1/workspaces/${slug}/agents`, () =>
    agentApi.list(slug),
  );

  // Status is derived from the daemon heartbeat, so the server has to be asked
  // again on its schedule. The same interval as the roster page, and the same
  // cache key: the overview is one more reader of that answer, not a poller of
  // its own.
  useEffect(() => {
    const interval = setInterval(
      () => invalidateApi(`/api/v1/workspaces/${slug}/agents`),
      AGENT_REFRESH_MS,
    );
    return () => clearInterval(interval);
  }, [slug]);

  const stats = useMemo(() => overviewStats(issues ?? []), [issues]);
  const intake = useMemo(() => weeklyCreated(issues ?? []), [issues]);
  const mix = useMemo(() => issueMix(issues ?? []), [issues]);
  const active = useMemo(() => activeIssues(issues ?? []), [issues]);
  const landed = useMemo(() => landedIssues(issues ?? []), [issues]);
  const summary = useMemo(() => agentSummary(agents ?? []), [agents]);
  const roster = useMemo(() => agentRoster(agents ?? []), [agents]);

  const error = workspaceError ?? issuesError ?? agentsError;
  const loading = workspaceLoading || issuesLoading || agentsLoading;

  const retry = () => {
    refreshWorkspace();
    refreshIssues();
    refreshAgents();
  };

  if (error) {
    return (
      <div className="p-8">
        <ErrorState
          what="workspace"
          error={error}
          onRetry={retry}
          notFoundHref={paths.workspaces()}
          notFoundLabel="Go to workspaces"
        />
      </div>
    );
  }

  if (loading || !workspace) return <OverviewSkeleton />;

  const repo = repoLabel(workspace);
  const repositoryHref = repoUrl(workspace);
  const issuesHref = paths.workspace(slug).issues();
  const agentsHref = paths.workspace(slug).agents();

  const flight = stats.inProgress + stats.inReview;
  const flightDetail =
    [
      stats.inProgress ? `${stats.inProgress} in progress` : null,
      stats.inReview ? `${stats.inReview} in review` : null,
    ]
      .filter(Boolean)
      .join(" · ") || "Nothing moving";
  const agentsDetail =
    summary.enabled === 0
      ? "No agents configured"
      : `of ${summary.enabled} enabled${
          summary.queued ? ` · ${summary.queued} queued` : ""
        }`;

  const mixSegments = [
    {
      key: "queued",
      label: "Queued",
      count: mix.queued,
      tone: STATUS_TONE.backlog.bar,
    },
    {
      key: "in-progress",
      label: "In progress",
      count: mix.inProgress,
      tone: STATUS_TONE.in_progress.bar,
    },
    {
      key: "in-review",
      label: "In review",
      count: mix.inReview,
      tone: STATUS_TONE.in_review.bar,
    },
    {
      key: "blocked",
      label: "Blocked",
      count: mix.blocked,
      tone: STATUS_TONE.blocked.bar,
    },
  ];

  return (
    <div className="px-8 py-6">
      <div className="overflow-hidden rounded-lg border border-hairline bg-canvas shadow-level-2">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-hairline px-6 py-5">
          <div className="flex min-w-0 items-start gap-3">
            <WorkspaceAvatar
              name={workspace.name}
              avatarUrl={workspace.avatar_url}
              className="size-12 rounded-lg"
            />
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <h2 className="truncate text-display font-semibold tracking-[-0.01em] text-ink">
                  {workspace.name}
                </h2>
                {repo && (
                  <Badge
                    variant="outline"
                    className="shrink-0 font-normal text-mute"
                  >
                    {workspace.repo_private ? "Private" : "Public"}
                  </Badge>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-mute">
                {repo && repositoryHref && (
                  <>
                    <a
                      href={repositoryHref}
                      target="_blank"
                      rel="noreferrer"
                      title="Open on GitHub"
                      className="flex min-w-0 items-center gap-1.5 transition-colors hover:text-ink"
                    >
                      <GitHubMark className="size-3.5 shrink-0" />
                      <span className="truncate font-mono text-body">{repo}</span>
                    </a>
                    <span aria-hidden="true">·</span>
                  </>
                )}
                <span>
                  created <TimeAgo iso={workspace.created_at} />
                </span>
              </div>
            </div>
          </div>
          {repositoryHref && (
            <Button variant="outline" size="sm" asChild>
              <a href={repositoryHref} target="_blank" rel="noreferrer">
                Open repository
                <ExternalLink className="size-3.5" />
              </a>
            </Button>
          )}
        </header>

        {/* Four readouts, four questions: how much work, how much is moving,
            what is stuck, who can move it. The cells are separated by the
            band's own background showing through a 1px gap, so the lines are
            the same hairline in a 2x2 and a 1x4. */}
        <div
          role="group"
          aria-label="Workspace at a glance"
          className="grid grid-cols-2 gap-px border-b border-hairline bg-hairline xl:grid-cols-4"
        >
          <Stat
            label="Open issues"
            value={stats.open}
            visual={<IntakeBars buckets={intake.buckets} />}
            detail={`${intake.total} new this week`}
          />
          <Stat label="In flight" value={flight} detail={flightDetail} />
          <Stat
            label="Blocked"
            value={stats.blocked}
            visual={
              stats.blocked > 0 ? (
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full bg-destructive"
                />
              ) : undefined
            }
            detail={stats.blocked > 0 ? "needs attention" : "none"}
          />
          <Stat
            label="Agents"
            value={summary.running}
            visual={
              summary.statuses.length > 0 ? (
                <AgentDots statuses={summary.statuses} />
              ) : undefined
            }
            detail={agentsDetail}
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 divide-y divide-hairline">
            <section>
              <SectionHeader
                title="Active issues"
                action={
                  <Link
                    href={issuesHref}
                    className="text-caption text-mute transition-colors hover:text-ink"
                  >
                    View all
                  </Link>
                }
              />
              {active.length === 0 ? (
                <p className="px-5 py-10 text-center text-caption text-mute">
                  Nothing in flight.{" "}
                  <Link
                    href={issuesHref}
                    className="text-link transition-colors hover:text-link-deep"
                  >
                    Open the board
                  </Link>
                </p>
              ) : (
                <ul role="list">
                  {active.map((issue) => (
                    <li
                      key={issue.id}
                      className="border-b border-hairline last:border-b-0"
                    >
                      <Link
                        href={paths.workspace(slug).issue(issue.issue_key)}
                        className="flex h-11 items-center gap-2.5 px-5 transition-colors hover:bg-muted/40"
                      >
                        <StatusIcon status={issue.status} />
                        <span className="shrink-0 font-mono text-caption text-mute">
                          {issue.issue_key}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-copy text-ink">
                          {issue.title}
                        </span>
                        <AgentStack agents={issue.agents} />
                        <IssuePullRequestBadge issue={issue} />
                        <span className="w-20 shrink-0 whitespace-nowrap text-right text-caption text-body">
                          {ISSUE_STATUS_LABELS[issue.status]}
                        </span>
                        <TimeAgo
                          iso={issue.updated_at}
                          className="w-20 shrink-0 whitespace-nowrap text-right font-mono text-caption tabular-nums text-mute"
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <SectionHeader title="Recently landed" />
              {landed.length === 0 ? (
                <p className="px-5 py-10 text-center text-caption text-mute">
                  Nothing landed this week.
                </p>
              ) : (
                <ul role="list">
                  {landed.map((issue) => (
                    <li
                      key={issue.id}
                      className="border-b border-hairline last:border-b-0"
                    >
                      <Link
                        href={paths.workspace(slug).issue(issue.issue_key)}
                        className="flex h-11 items-center gap-2.5 px-5 transition-colors hover:bg-muted/40"
                      >
                        <StatusIcon status={issue.status} />
                        <span className="shrink-0 font-mono text-caption text-mute">
                          {issue.issue_key}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-copy text-ink">
                          {issue.title}
                        </span>
                        {issue.assignee ? (
                          <span className="shrink-0" title={issue.assignee.login}>
                            <WorkspaceAvatar
                              name={issue.assignee.login}
                              avatarUrl={issue.assignee.avatar_url}
                              className="size-4"
                            />
                          </span>
                        ) : (
                          <AgentStack agents={issue.agents} />
                        )}
                        <TimeAgo
                          iso={issue.updated_at}
                          className="w-20 shrink-0 whitespace-nowrap text-right font-mono text-caption tabular-nums text-mute"
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <aside className="min-w-0 divide-y divide-hairline border-t border-hairline xl:border-l xl:border-t-0">
            <section>
              <SectionHeader title="About" />
              <div className="px-5 py-4">
                {repositoryHref ? (
                  <>
                    <a
                      href={repositoryHref}
                      target="_blank"
                      rel="noreferrer"
                      title="Open on GitHub"
                      className="flex min-w-0 items-center gap-1.5 transition-colors hover:text-ink"
                    >
                      <GitHubMark className="size-4 shrink-0 text-mute" />
                      <span className="truncate font-mono text-caption text-body">
                        {repo}
                      </span>
                      {workspace.repo_private && (
                        <Lock
                          className="size-3 shrink-0 text-mute"
                          aria-hidden="true"
                        />
                      )}
                    </a>
                    <p className="mt-3 line-clamp-2 text-caption text-body">
                      {workspace.last_commit_message || "No commits yet"}
                    </p>
                    {workspace.last_commit_at && (
                      <p className="mt-1 flex min-w-0 items-center gap-1.5 text-caption text-mute">
                        <span className="truncate">
                          {workspace.last_commit_author || "Unknown"}
                        </span>
                        <span aria-hidden="true">·</span>
                        <TimeAgo
                          iso={workspace.last_commit_at}
                          className="shrink-0 whitespace-nowrap font-mono tabular-nums"
                        />
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-caption text-mute">No repository linked.</p>
                )}
              </div>
            </section>

            <section>
              <SectionHeader
                title="Issue mix"
                action={
                  mix.open > 0 ? (
                    <span className="text-caption tabular-nums text-mute">
                      {mix.open} open
                    </span>
                  ) : undefined
                }
              />
              <div className="px-5 py-4">
                {mix.open === 0 ? (
                  <p className="text-caption text-mute">No open issues.</p>
                ) : (
                  <>
                    <div
                      aria-hidden="true"
                      className="flex h-1.5 overflow-hidden rounded-full bg-canvas-soft-2"
                    >
                      {mixSegments
                        .filter((segment) => segment.count > 0)
                        .map((segment) => (
                          <span
                            key={segment.key}
                            className={`${segment.tone} h-full`}
                            style={{
                              flexGrow: segment.count,
                              flexBasis: 0,
                              minWidth: 2,
                            }}
                          />
                        ))}
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
                      {mixSegments.map((segment) => (
                        <div
                          key={segment.key}
                          className="flex min-w-0 items-center gap-1.5"
                        >
                          <span
                            aria-hidden="true"
                            className={`size-1.5 shrink-0 rounded-full ${segment.tone}`}
                          />
                          <dt className="truncate text-caption text-body">
                            {segment.label}
                          </dt>
                          <dd className="ml-auto text-caption tabular-nums text-mute">
                            {segment.count}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </>
                )}
              </div>
            </section>

            <section>
              <SectionHeader
                title="Agents"
                action={
                  <Link
                    href={agentsHref}
                    className="text-caption text-mute transition-colors hover:text-ink"
                  >
                    View all
                  </Link>
                }
              />
              {summary.enabled === 0 ? (
                <p className="px-5 py-8 text-center text-caption text-mute">
                  No agents yet.{" "}
                  <Link
                    href={agentsHref}
                    className="text-link transition-colors hover:text-link-deep"
                  >
                    Add an agent
                  </Link>
                </p>
              ) : (
                <div className="px-5 py-3">
                  <p className="text-caption text-mute">
                    {summary.enabled} enabled · {summary.running} working
                    {summary.queued > 0 && ` · ${summary.queued} queued`}
                  </p>
                  <ul role="list" className="mt-1">
                    {roster.map((agent) => {
                      const status = agentStatus(agent);
                      return (
                        <li key={agent.id}>
                          <Link
                            href={agentsHref}
                            className="-mx-2 flex h-11 items-center gap-2.5 rounded-sm px-2 transition-colors hover:bg-muted/40"
                          >
                            {agent.avatar_url ? (
                              <WorkspaceAvatar
                                name={agent.name}
                                avatarUrl={agent.avatar_url}
                                className="size-6"
                              />
                            ) : (
                              <AgentHead
                                shape={agent.head_shape}
                                status={status}
                                size={24}
                                className="shrink-0"
                              />
                            )}
                            <span className="min-w-0 flex-1 truncate text-copy font-medium text-ink">
                              @{agent.name}
                            </span>
                            <AgentStatusBadge status={status} />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

/** One cell of the readout band. The label is above the number so the band
 * scans as four questions rather than four values. */
function Stat({
  label,
  value,
  visual,
  detail,
}: {
  label: string;
  value: number;
  visual?: React.ReactNode;
  detail: string;
}) {
  return (
    <div className="min-w-0 bg-canvas px-5 py-4">
      <p className="text-caption text-mute">{label}</p>
      <div className="mt-1 flex min-h-7 items-end justify-between gap-3">
        <p className="text-title font-semibold tabular-nums text-ink">
          {value}
        </p>
        {visual}
      </div>
      <p className="mt-1 truncate text-caption text-mute" title={detail}>
        {detail}
      </p>
    </div>
  );
}

/** Seven 3px bars, oldest to today. The last day is the full accent; the rest
 * sit at half strength so "today" reads without a second label. */
function IntakeBars({ buckets }: { buckets: number[] }) {
  const max = Math.max(1, ...buckets);
  return (
    <span aria-hidden="true" className="flex h-5 items-end gap-[3px]">
      {buckets.map((count, i) => (
        <span
          key={i}
          className={`w-[3px] rounded-full ${
            i === buckets.length - 1 ? "bg-link" : "bg-link/50"
          }`}
          style={{ height: `${Math.max(2, Math.round((count / max) * 20))}px` }}
        />
      ))}
    </span>
  );
}

/** One dot per enabled agent, busiest first. The written detail beside the
 * number carries the counts, so the dots stay decorative. */
function AgentDots({ statuses }: { statuses: AgentStatus[] }) {
  const shown = statuses.slice(0, 6);
  return (
    <span aria-hidden="true" className="flex items-center gap-1">
      {shown.map((status, i) => (
        <span
          key={i}
          className={`size-1.5 rounded-full ${STATUS_DOT[status]}`}
        />
      ))}
      {statuses.length > shown.length && (
        <span className="text-caption tabular-nums text-mute">
          +{statuses.length - shown.length}
        </span>
      )}
    </span>
  );
}

function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex h-11 items-center justify-between gap-3 border-b border-hairline px-5">
      <h3 className="text-label font-semibold text-ink">{title}</h3>
      {action}
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="px-8 py-6">
      <div className="overflow-hidden rounded-lg border border-hairline bg-canvas shadow-level-2">
        <div className="flex items-center gap-3 border-b border-hairline px-6 py-5">
          <Skeleton className="size-12 rounded-lg" />
          <div>
            <Skeleton className="h-7 w-48" />
            <Skeleton className="mt-2 h-3.5 w-64" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px border-b border-hairline bg-hairline xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-canvas px-5 py-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-2 h-6 w-10" />
              <Skeleton className="mt-2 h-3 w-24" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="divide-y divide-hairline">
            <div className="p-5">
              <Skeleton className="h-4 w-24" />
              <div className="mt-4 space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            </div>
            <div className="p-5">
              <Skeleton className="h-4 w-28" />
              <div className="mt-4 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            </div>
          </div>
          <div className="divide-y divide-hairline border-t border-hairline xl:border-l xl:border-t-0">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="p-5">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="mt-3 h-3 w-full" />
                <Skeleton className="mt-2 h-3 w-2/3" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
