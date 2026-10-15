"use client";

import { Bot } from "lucide-react";
import { agentApi, type Agent } from "@/lib/api";
import { useApi } from "@/lib/query";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/error-state";
import { AgentTable } from "@/components/agents/agent-table";
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

/**
 * The All Workspaces roster: every agent in every workspace you own.
 *
 * The second page that reads across workspaces, and the one where the Workspace
 * column earns its place most: "@planner" is a name people reuse, and one
 * machine can back runtimes in several workspaces at once, so a flat list of
 * agent names would be genuinely ambiguous.
 *
 * Read-only, like the board across workspaces: creating, editing and deleting an
 * agent all belong to a workspace, and this page is not in one. Each row's
 * workspace links to that workspace's roster, which is where the edits are.
 */
export default function AllAgentsPage() {
  const {
    data: agents,
    loading,
    error,
    refresh,
  } = useApi<Agent[]>("/api/v1/agents", () => agentApi.listAll());

  if (error) {
    return (
      <div className="p-8">
        <ErrorState what="agents" error={error} onRetry={refresh} />
      </div>
    );
  }

  return (
    <div className="flex-1 px-8 pb-8 pt-6">
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-md" />
          ))}
        </div>
      ) : (agents ?? []).length === 0 ? (
        <Empty className="rounded-lg bg-canvas-soft py-16">
          <EmptyMedia>
            <Bot className="size-5" />
          </EmptyMedia>
          <EmptyTitle>No agents yet</EmptyTitle>
          <EmptyDescription>
            An agent belongs to a workspace. Create one there and it will show up
            here.
          </EmptyDescription>
        </Empty>
      ) : (
        <AgentTable agents={agents ?? []} />
      )}
    </div>
  );
}
