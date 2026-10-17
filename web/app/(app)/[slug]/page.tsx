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
import { AGENT_REFRESH_MS, agentStatus } from "@/lib/agent-status";
import {
  activeIssues,
  overviewStats,
  repoLabel,
  repoUrl,
  squad,
} from "@/lib/overview";
import { AgentHead } from "@/components/agents/agent-head";
import { AgentStatusBadge } from "@/components/status-dot";
import { ErrorState } from "@/components/error-state";
import { GitHubMark } from "@/components/github-mark";
import { StatusIcon } from "@/components/status-icon";
import { TimeAgo } from "@/components/time-ago";
import { WorkspaceAvatar } from "@/components/workspace-avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * A workspace's front page: what it is and what is happening in it right now.
 *
 * It reads the same three endpoints the board, the roster and the settings page
 * read — no aggregate endpoint — because the overview is a view of that data,
 * not another copy of it. Everything that needs deciding (what counts as open,
 * what is "in flight", which agents are the squad) lives in lib/overview.ts and
 * is unit-tested; this file is layout.
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
  const active = useMemo(() => activeIssues(issues ?? []), [issues]);
  const roster = useMemo(() => squad(agents ?? []), [agents]);

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

  return (
    <div className="flex flex-col gap-6 px-8 py-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <WorkspaceAvatar
            name={workspace.name}
            avatarUrl={workspace.avatar_url}
            className="size-10"
          />
          <div className="min-w-0">
            <h2 className="truncate text-display font-semibold tracking-[-0.01em] text-ink">
              {workspace.name}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-mute">
              {repo && (
                <>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <GitHubMark className="size-3.5 shrink-0" />
                    <span className="truncate font-mono text-body">{repo}</span>
                    {workspace.repo_private && (
                      <Lock className="size-3 shrink-0" aria-hidden="true" />
                    )}
                  </span>
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

      <div className="grid grid-cols-4 divide-x divide-hairline overflow-hidden rounded-lg border border-hairline bg-canvas shadow-level-2">
        {[
          { label: "Open issues", value: stats.open },
          { label: "In progress", value: stats.inProgress },
          { label: "In review", value: stats.inReview },
          { label: "Blocked", value: stats.blocked },
        ].map((stat) => (
          <div key={stat.label} className="px-4 py-3">
            <p className="text-title font-semibold tabular-nums text-ink">
              {stat.value}
            </p>
            <p className="mt-0.5 text-caption text-mute">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <section className="overflow-hidden rounded-lg border border-hairline bg-canvas shadow-level-2 lg:col-span-2">
          <div className="flex h-11 items-center justify-between gap-3 border-b border-hairline px-4">
            <h3 className="text-label font-semibold text-ink">Active issues</h3>
            <Link
              href={issuesHref}
              className="text-caption text-mute transition-colors hover:text-ink"
            >
              View all
            </Link>
          </div>
          {active.length === 0 ? (
            <p className="px-4 py-10 text-center text-caption text-mute">
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
                    className="flex h-11 items-center gap-3 px-4 transition-colors hover:bg-muted/40"
                  >
                    <StatusIcon status={issue.status} />
                    <span className="shrink-0 font-mono text-caption text-mute">
                      {issue.issue_key}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-copy text-ink">
                      {issue.title}
                    </span>
                    <span className="shrink-0 text-caption text-body">
                      {ISSUE_STATUS_LABELS[issue.status]}
                    </span>
                    <TimeAgo
                      iso={issue.updated_at}
                      className="shrink-0 font-mono text-caption tabular-nums text-mute"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex flex-col gap-4">
          <section className="overflow-hidden rounded-lg border border-hairline bg-canvas shadow-level-2">
            <div className="flex h-11 items-center justify-between gap-3 border-b border-hairline px-4">
              <h3 className="text-label font-semibold text-ink">Squad</h3>
              <Link
                href={agentsHref}
                className="text-caption text-mute transition-colors hover:text-ink"
              >
                View all
              </Link>
            </div>
            {roster.length === 0 ? (
              <p className="px-4 py-8 text-center text-caption text-mute">
                No agents yet.{" "}
                <Link
                  href={agentsHref}
                  className="text-link transition-colors hover:text-link-deep"
                >
                  Configure the squad
                </Link>
              </p>
            ) : (
              <ul role="list">
                {roster.map((agent) => {
                  const status = agentStatus(agent);
                  return (
                    <li
                      key={agent.id}
                      className="border-b border-hairline last:border-b-0"
                    >
                      <Link
                        href={agentsHref}
                        className="flex h-11 items-center gap-2.5 px-4 transition-colors hover:bg-muted/40"
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
            )}
          </section>

          <section className="overflow-hidden rounded-lg border border-hairline bg-canvas shadow-level-2">
            <div className="flex h-11 items-center border-b border-hairline px-4">
              <h3 className="text-label font-semibold text-ink">Repository</h3>
            </div>
            <div className="px-4 py-3">
              {repo ? (
                <>
                  <p className="flex min-w-0 items-center gap-1.5">
                    <GitHubMark className="size-4 shrink-0 text-mute" />
                    <span className="truncate font-mono text-caption text-body">
                      {repo}
                    </span>
                    {workspace.repo_private && (
                      <Lock className="size-3 shrink-0 text-mute" aria-hidden="true" />
                    )}
                  </p>
                  <p className="mt-2 line-clamp-2 text-caption text-body">
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
                        className="shrink-0 font-mono tabular-nums"
                      />
                    </p>
                  )}
                </>
              ) : (
                <p className="text-caption text-mute">No repository linked.</p>
              )}
            </div>
            {repositoryHref && (
              <div className="border-t border-hairline px-4 py-2.5">
                <a
                  href={repositoryHref}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-caption text-mute transition-colors hover:text-ink"
                >
                  Open on GitHub
                  <ExternalLink className="size-3" />
                </a>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-6 px-8 py-6">
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-lg" />
        <div>
          <Skeleton className="h-7 w-48" />
          <Skeleton className="mt-2 h-3.5 w-64" />
        </div>
      </div>
      <div className="grid grid-cols-4 divide-x divide-hairline overflow-hidden rounded-lg border border-hairline bg-canvas">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="px-4 py-3">
            <Skeleton className="h-5 w-8" />
            <Skeleton className="mt-2 h-3 w-20" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-hairline bg-canvas p-4 lg:col-span-2">
          <Skeleton className="h-4 w-24" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-hairline bg-canvas p-4">
          <Skeleton className="h-4 w-16" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
