"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { agentApi, type Agent } from "@/lib/api";
import { AGENT_REFRESH_MS } from "@/lib/agent-status";
import { offlineDaemons } from "@/lib/agent-presence";
import {
  activeAgentFilters,
  agentFilterCounts,
  filterAgents,
  NO_AGENT_FILTERS,
  type AgentFilters,
} from "@/lib/agent-filters";
import { paths } from "@/lib/paths";
import { invalidateApi, useApi } from "@/lib/query";
import { AgentDaemonBanner } from "@/components/agents/agent-daemon-banner";
import { AgentDialog } from "@/components/agents/agent-dialog";
import { AgentFilterMenu } from "@/components/agents/agent-filter-menu";
import { AgentHead } from "@/components/agents/agent-head";
import { AgentRoster } from "@/components/agents/agent-roster";
import { PageToolbar, PageToolbarSkeleton } from "@/components/page-toolbar";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * A workspace's agents: who they are, what they are doing, and whether the
 * machine under them can run.
 *
 * The page used to be a table with one status word per row and a row of chips
 * above it. Three things were wrong with that, and all three were about the
 * same missing layer — there was nowhere to *read* an agent:
 *
 *   - an offline daemon turned every agent on it into "Offline", including the
 *     one with tasks still queued behind it;
 *   - the row said "1 run" where the question is "doing what";
 *   - the filter flattened "can it run" and "does it have work" into one list
 *     of five words, and offered no search.
 *
 * Reading now happens on the agent's own page; this page is the roster that
 * gets you there.
 */
export default function WorkspaceAgentsPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();

  const {
    data: agents,
    loading,
    error,
    refresh,
  } = useApi<Agent[]>(`/api/v1/workspaces/${slug}/agents`, () =>
    agentApi.list(slug),
  );

  // Status is derived from the daemon heartbeat, so the server has to be asked
  // again on its schedule, not on the render's.
  useEffect(() => {
    const interval = setInterval(
      () => invalidateApi(`/api/v1/workspaces/${slug}/agents`),
      AGENT_REFRESH_MS,
    );
    return () => clearInterval(interval);
  }, [slug]);

  useEffect(() => {
    if (error) router.push(paths.workspaces());
  }, [error, router]);

  const [filters, setFilters] = useState<AgentFilters>(NO_AGENT_FILTERS);
  // "new" or the agent being edited; mounted only while open.
  const [dialog, setDialog] = useState<Agent | "new" | null>(null);

  const roster = useMemo(() => agents ?? [], [agents]);
  const counts = useMemo(() => agentFilterCounts(roster), [roster]);
  const visible = useMemo(() => filterAgents(roster, filters), [roster, filters]);
  const offline = useMemo(() => offlineDaemons(roster), [roster]);
  const narrowed =
    filters.search.trim() !== "" || activeAgentFilters(filters) > 0;

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <PageToolbarSkeleton
          leading={
            <>
              <Skeleton className="h-8 w-56" />
              <Skeleton className="h-8 w-20" />
            </>
          }
          actions={<Skeleton className="h-8 w-28" />}
        />
        <div className="flex-1 px-8 pb-8 pt-2">
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-md" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PageToolbar
        leading={
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-mute" />
              <Input
                value={filters.search}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, search: e.target.value }))
                }
                placeholder="Search agents…"
                aria-label="Search agents"
                className="h-8 w-56 pl-8"
              />
            </div>
            <AgentFilterMenu
              filters={filters}
              onChange={setFilters}
              counts={counts}
            />
            {narrowed && (
              <span className="text-caption tabular-nums text-mute">
                {visible.length} of {roster.length}
              </span>
            )}
          </>
        }
        actions={
          <Button onClick={() => setDialog("new")}>
            <Plus className="size-4" />
            New agent
          </Button>
        }
      />

      <div className="flex-1 px-8 pb-8 pt-2">
        <div className="space-y-3">
          <AgentDaemonBanner daemons={offline} />

          {roster.length === 0 ? (
            <Empty className="rounded-lg bg-canvas-soft py-16">
              {/* The hero's own head — the antenna, the floor shadow and its own
                  life (it blinks, it hops, it follows the pointer), which is what
                  hero-head.tsx passes and what "like the homepage" means.
                  `paused={false}` overrides the roster's default, where a head
                  moves only while its agent has work: an empty roster has nothing
                  to signal, so this one may simply live. */}
              <AgentHead size={96} interactive antenna floorShadow paused={false} />
              <EmptyTitle>No agents yet</EmptyTitle>
              <EmptyDescription>
                Agents are AI workers bound to a runtime. Create one to start
                mentioning it in issues.
              </EmptyDescription>
              <Button onClick={() => setDialog("new")} className="mt-1">
                <Plus className="size-4" />
                Create your first agent
              </Button>
            </Empty>
          ) : (
            <AgentRoster
              groups={[{ key: slug, slug, agents: visible }]}
              empty="No agents match this filter."
            />
          )}
        </div>
      </div>

      {dialog && (
        <AgentDialog
          slug={slug}
          agent={dialog === "new" ? null : dialog}
          onClose={() => setDialog(null)}
          onSaved={refresh}
          onDeleted={refresh}
        />
      )}
    </div>
  );
}
