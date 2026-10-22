"use client";

import { useEffect, useMemo } from "react";
import { agentApi, type Agent } from "@/lib/api";
import { AGENT_REFRESH_MS } from "@/lib/agent-status";
import { offlineDaemons } from "@/lib/agent-presence";
import { invalidateApi, useApi } from "@/lib/query";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/error-state";
import { AgentDaemonBanner } from "@/components/agents/agent-daemon-banner";
import { AgentHead } from "@/components/agents/agent-head";
import { AgentRoster, type AgentGroup } from "@/components/agents/agent-roster";
import {
  Empty,
  EmptyDescription,
  EmptyTitle,
} from "@/components/ui/empty";

/**
 * One group per workspace, in the order the server sent them — it orders by
 * workspace then name, so this is a fold rather than a sort. The key is the
 * slug: two workspaces can share a name, and only the slug tells them apart.
 */
function groupByWorkspace(agents: Agent[]): AgentGroup[] {
  const groups = new Map<string, AgentGroup>();
  for (const agent of agents) {
    const key = agent.workspace_slug ?? agent.workspace_id;
    const group = groups.get(key) ?? {
      key,
      name: agent.workspace_name,
      slug: agent.workspace_slug,
      agents: [],
    };
    group.agents.push(agent);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/**
 * The All Workspaces roster: every agent in every workspace you own, grouped by
 * the workspace each belongs to.
 *
 * The second page that reads across workspaces, and the one where drawing the
 * workspace matters most: "@planner" is a name people reuse, and one machine can
 * back runtimes in several workspaces at once, so a flat list of agent names
 * would be genuinely ambiguous. The workspace is the group header here rather
 * than a column — the same name down twenty rows is a header waiting to happen.
 *
 * Read-only, like the board across workspaces: creating, editing and deleting an
 * agent all belong to a workspace, and this page is not in one. Each row still
 * opens its agent, in the workspace that owns it, and each header carries the
 * link to that workspace's roster.
 */
export default function AllAgentsPage() {
  const {
    data: agents,
    loading,
    error,
    refresh,
  } = useApi<Agent[]>("/api/v1/agents", () => agentApi.listAll());

  // No socket here — the app's connection is scoped to a workspace — and status
  // is derived from the daemon heartbeat, so the page has to ask again on its
  // own schedule. Same interval as the roster inside a workspace, for the same
  // reason.
  useEffect(() => {
    const interval = setInterval(
      () => invalidateApi("/api/v1/agents"),
      AGENT_REFRESH_MS,
    );
    return () => clearInterval(interval);
  }, []);

  const roster = useMemo(() => agents ?? [], [agents]);
  const offline = useMemo(() => offlineDaemons(roster), [roster]);

  if (error) {
    return (
      <div className="p-8">
        <ErrorState what="agents" error={error} onRetry={refresh} />
      </div>
    );
  }

  return (
    <div className="flex-1 px-8 pb-8 pt-6">
      <div className="space-y-3">
        <AgentDaemonBanner daemons={offline} />

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-md" />
            ))}
          </div>
        ) : roster.length === 0 ? (
          <Empty className="rounded-lg bg-canvas-soft py-16">
            {/* The same head the workspace roster's empty state draws, with the
                same settings — one empty state, two copies of the sentence. */}
            <AgentHead size={96} interactive antenna floorShadow paused={false} />
            <EmptyTitle>No agents yet</EmptyTitle>
            <EmptyDescription>
              An agent belongs to a workspace. Create one there and it will show
              up here.
            </EmptyDescription>
          </Empty>
        ) : (
          <AgentRoster groups={groupByWorkspace(roster)} />
        )}
      </div>
    </div>
  );
}
