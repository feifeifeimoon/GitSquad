"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  CheckCircle2,
  CircleSlash,
  Clock,
  Loader2,
  Pencil,
  Play,
  Server,
  XCircle,
} from "lucide-react";
import { agentApi, type Agent, type AgentTask } from "@/lib/api";
import { AGENT_REFRESH_MS, agentStatus } from "@/lib/agent-status";
import { agentActivity, agentPresence } from "@/lib/agent-presence";
import { paths } from "@/lib/paths";
import { invalidateApi, useApi } from "@/lib/query";
import { AgentDialog } from "@/components/agents/agent-dialog";
import { AgentHead } from "@/components/agents/agent-head";
import { AgentPresenceBadge } from "@/components/agents/agent-presence-badge";
import { Markdown } from "@/components/markdown";
import { ProviderIcon } from "@/components/provider-icon";
import { TimeAgo } from "@/components/time-ago";
import { WorkspaceAvatar } from "@/components/workspace-avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * One agent, the page a roster row leads to.
 *
 * Reading an agent used to mean opening its edit form — the instructions, the
 * skills and the model were only ever visible as fields in a dialog, so "what
 * does @planner actually do?" was a question you answered by starting an edit
 * and cancelling it. This page is the reading surface: what it is doing now,
 * what it has done, and the words it works from. Editing is still the dialog,
 * opened from here.
 *
 * The history is read-only on purpose (see the design's non-goals): the console
 * does not cancel or retry runs, and a row that looks like it could would be a
 * promise the API does not keep.
 */
export default function AgentDetailPage() {
  const { slug, agentId } = useParams<{ slug: string; agentId: string }>();
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  const {
    data: agent,
    loading,
    error,
    refresh,
  } = useApi<Agent>(`/api/v1/workspaces/${slug}/agents/${agentId}`, () =>
    agentApi.get(slug, agentId),
  );
  const {
    data: tasks,
    loading: tasksLoading,
    refresh: refreshTasks,
  } = useApi<AgentTask[]>(
    `/api/v1/workspaces/${slug}/agents/${agentId}/tasks?limit=20`,
    () => agentApi.tasks(slug, agentId, 20),
  );

  useEffect(() => {
    if (error) router.push(paths.workspace(slug).agents());
  }, [error, router, slug]);

  // Presence and history move on the daemon's schedule, not on a render's: the
  // heartbeat decides whether the machine is reachable and a running task turns
  // into a finished one without any workspace event. Same interval as every
  // other agent read. The prefix also covers this agent's `/tasks` key.
  useEffect(() => {
    const interval = setInterval(
      () => invalidateApi(`/api/v1/workspaces/${slug}/agents/${agentId}`),
      AGENT_REFRESH_MS,
    );
    return () => clearInterval(interval);
  }, [slug, agentId]);

  if (loading || !agent) {
    return (
      <div className="px-8 py-6">
        <div className="flex items-center gap-4">
          <Skeleton className="size-13 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-72" />
          </div>
        </div>
        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="space-y-3">
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-full" />
          </div>
        </div>
      </div>
    );
  }

  const presence = agentPresence(agent);
  const activity = agentActivity(agent);
  const runtime = agent.runtime;
  // The endpoint returns finished runs only (see ListFinishedTasksByAgent): the
  // one in flight is the Now card, and a queue must not eat the limit. No second
  // filter here — a duplicated rule is one that can silently disagree.
  const runs = tasks ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-hairline pb-5">
          <div className="flex min-w-0 items-start gap-4">
            {agent.avatar_url ? (
              <WorkspaceAvatar
                name={agent.name}
                avatarUrl={agent.avatar_url}
                className="size-13 shrink-0 rounded-xl"
              />
            ) : (
              <span className="flex size-13 shrink-0 items-center justify-center rounded-xl bg-canvas-soft-2">
                <AgentHead
                  shape={agent.head_shape}
                  status={agentStatus(agent)}
                  size={40}
                />
              </span>
            )}
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                {/* h2: the bar above the page owns the h1 ("Agents"). */}
                <h2 className="truncate text-display font-semibold tracking-[-0.01em] text-ink">
                  @{agent.name}
                </h2>
                <AgentPresenceBadge presence={presence} queued={agent.queued_count} />
                {!agent.enabled && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-caption text-mute">
                    disabled
                  </span>
                )}
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-mute">
                {agent.description && <span>{agent.description}</span>}
                {agent.description && <span aria-hidden="true">·</span>}
                <span className="flex items-center gap-1.5">
                  <ProviderIcon provider={runtime?.provider ?? ""} className="size-3.5" />
                  {runtime?.provider || "no runtime"}
                </span>
                <span className="flex items-center gap-1.5">
                  <Server className="size-3.5" aria-hidden="true" />
                  {runtime?.daemon_name || "no machine"}
                </span>
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" />
            Edit
          </Button>
        </header>

        <div className="grid grid-cols-1 gap-8 pt-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="min-w-0 space-y-8">
            <section>
              <SectionTitle>Now</SectionTitle>
              {activity.kind === "issue" ? (
                <Link
                  href={paths.workspace(slug).issue(activity.issueKey)}
                  className="flex items-start gap-2.5 rounded-lg border border-hairline bg-canvas p-3 shadow-level-2 transition-colors hover:border-hairline-strong"
                >
                  <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-link" />
                  <span className="min-w-0">
                    <span className="block font-mono text-micro text-mute">
                      {activity.issueKey}
                    </span>
                    <span className="block truncate text-copy font-medium text-ink">
                      {activity.issueTitle || "Untitled issue"}
                    </span>
                    <span className="mt-0.5 block text-caption text-mute">
                      {agent.running_count > 0
                        ? "Running now"
                        : `${agent.queued_count} queued`}
                      {agent.queued_count > 0 && agent.running_count > 0
                        ? ` · ${agent.queued_count} more queued`
                        : ""}
                    </span>
                  </span>
                </Link>
              ) : (
                <p className="rounded-lg border border-dashed border-hairline px-3 py-4 text-caption text-mute">
                  {activity.kind === "review"
                    ? "Working on a pull request review."
                    : activity.kind === "queued"
                      ? `${activity.queued} queued — waiting for the machine.`
                      : "Nothing in flight."}
                </p>
              )}
            </section>

            <section>
              <SectionTitle aside={runs.length > 0 ? `last ${runs.length}` : undefined}>
                Recent runs
              </SectionTitle>
              {tasksLoading && !tasks ? (
                <div className="space-y-1.5">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full rounded-md" />
                  ))}
                </div>
              ) : runs.length === 0 ? (
                <p className="rounded-lg border border-dashed border-hairline px-3 py-4 text-caption text-mute">
                  No finished runs yet. Mention @{agent.name} on an issue to start
                  one.
                </p>
              ) : (
                <ul className="overflow-hidden rounded-lg border border-hairline bg-canvas shadow-level-2">
                  {runs.map((task) => (
                    <RunRow key={task.id} task={task} slug={slug} />
                  ))}
                </ul>
              )}
            </section>

            <section>
              <SectionTitle
                aside={
                  <button
                    onClick={() => setEditing(true)}
                    aria-label="Edit instructions"
                    className="text-caption text-mute transition-colors hover:text-ink"
                  >
                    Edit instructions
                  </button>
                }
              >
                Instructions
              </SectionTitle>
              <div className="rounded-lg border border-hairline bg-canvas px-4 py-3 shadow-level-2">
                {agent.instructions.trim() ? (
                  <Markdown>{agent.instructions}</Markdown>
                ) : (
                  <p className="text-caption text-mute">
                    No instructions yet. This agent runs on the provider&apos;s
                    defaults.
                  </p>
                )}
              </div>
            </section>
          </div>

          <aside className="min-w-0 space-y-6">
            <div>
              <SectionTitle>Runtime</SectionTitle>
              <dl className="divide-y divide-hairline">
                <Fact label="Provider">
                  <ProviderIcon provider={runtime?.provider ?? ""} className="size-3.5" />
                  {runtime?.provider || "—"}
                </Fact>
                <Fact label="Model">
                  <span className="font-mono text-caption">
                    {agent.model || "provider default"}
                  </span>
                </Fact>
                <Fact label="Daemon">
                  {runtime?.daemon_name || "no machine"}
                </Fact>
              </dl>
            </div>

            <div>
              <SectionTitle aside={(agent.skills ?? []).length || undefined}>
                Skills
              </SectionTitle>
              {(agent.skills ?? []).length === 0 ? (
                <p className="text-caption text-mute">
                  No skills. Add some in{" "}
                  <Link
                    href={paths.workspace(slug).skills()}
                    className="text-link transition-colors hover:text-link-deep"
                  >
                    Skills
                  </Link>
                  .
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {(agent.skills ?? []).map((skill) => (
                    <span
                      key={skill.id}
                      className="inline-flex h-6 items-center rounded-sm bg-muted px-2 text-caption text-body"
                    >
                      {skill.name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <SectionTitle>Activity</SectionTitle>
              <dl className="divide-y divide-hairline">
                <Fact label="Runs">{agent.total_runs} finished</Fact>
                <Fact label="Created">
                  <TimeAgo iso={agent.created_at} />
                </Fact>
                <Fact label="Updated">
                  <TimeAgo iso={agent.updated_at} />
                </Fact>
              </dl>
            </div>
          </aside>
        </div>
      </div>

      {editing && (
        <AgentDialog
          slug={slug}
          agent={agent}
          onClose={() => setEditing(false)}
          onSaved={() => {
            refresh();
            refreshTasks();
          }}
          onDeleted={() => router.push(paths.workspace(slug).agents())}
        />
      )}
    </div>
  );
}

function SectionTitle({
  children,
  aside,
}: {
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="mb-2.5 flex min-h-5 items-center justify-between gap-3">
      <h3 className="text-label font-semibold text-ink">{children}</h3>
      {aside ? <span className="text-caption text-mute">{aside}</span> : null}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-2 first:pt-0 last:pb-0">
      <dt className="text-caption text-mute">{label}</dt>
      <dd className="mt-0.5 flex min-w-0 items-center gap-1.5 text-copy text-body">
        {children}
      </dd>
    </div>
  );
}

/** The icon and tone for one run status — one map, so a failure never looks
 * like a success because two places disagreed about a word. */
function runVisual(status: AgentTask["status"]) {
  switch (status) {
    case "completed":
      return { Icon: CheckCircle2, tone: "text-success", spin: false };
    case "failed":
      return { Icon: XCircle, tone: "text-destructive", spin: false };
    case "cancelled":
      return { Icon: CircleSlash, tone: "text-mute", spin: false };
    case "running":
      return { Icon: Loader2, tone: "text-link", spin: true };
    case "dispatched":
      return { Icon: Play, tone: "text-body", spin: false };
    default:
      return { Icon: Clock, tone: "text-mute", spin: false };
  }
}

/** "2m 14s", or "—" while a run has no endpoint yet. */
function formatDuration(start: string | null, end: string | null): string {
  if (!start || !end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const seconds = Math.round(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}

function RunRow({ task, slug }: { task: AgentTask; slug: string }) {
  const { Icon, tone, spin } = runVisual(task.status);
  const subject =
    task.kind === "review" && task.pr_number > 0
      ? `#${task.pr_number} review`
      : task.issue_key;

  return (
    <li className="flex items-center gap-3 border-b border-hairline px-3 py-2.5 last:border-b-0">
      <Icon
        className={`size-3.5 shrink-0 ${tone} ${spin ? "animate-spin" : ""}`}
        aria-hidden="true"
      />
      <span className="w-16 shrink-0 truncate font-mono text-micro text-mute">
        {subject || "—"}
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span className="min-w-0 truncate text-caption text-ink">
          {task.issue_key ? (
            <Link
              href={paths.workspace(slug).issue(task.issue_key)}
              className="transition-colors hover:text-link"
            >
              {task.issue_title || task.issue_key}
            </Link>
          ) : (
            "Pull request review"
          )}
        </span>
        {/* Why it failed, on a failed row. The reason is the one thing a red
            icon cannot say, and it used to be dropped for issue runs. */}
        {task.status === "failed" && task.failure_reason && (
          <span
            className="max-w-44 shrink-0 truncate font-mono text-micro text-destructive"
            title={task.failure_reason}
          >
            {task.failure_reason}
          </span>
        )}
      </span>
      <span className="shrink-0 font-mono text-micro tabular-nums text-mute">
        {formatDuration(task.started_at, task.completed_at)}
      </span>
      <TimeAgo
        iso={task.completed_at ?? task.created_at}
        className="w-16 shrink-0 text-right text-caption tabular-nums text-mute"
      />
    </li>
  );
}
