import {
  agentPresence,
  type AgentAvailability,
  type AgentPresenceInput,
  type AgentWorkload,
} from "./agent-presence";

// What the roster is asked to narrow to. Two facets, single choice each (the
// `All` value is "do not narrow"), combined with AND; search is separate and
// never counts as a facet.
export interface AgentFilters {
  search: string;
  availability: "all" | AgentAvailability;
  workload: "all" | AgentWorkload;
}

export const NO_AGENT_FILTERS: AgentFilters = {
  search: "",
  availability: "all",
  workload: "all",
};

/** How many facets are set — the number on the Filter button. */
export function activeAgentFilters(filters: AgentFilters): number {
  return (
    (filters.availability === "all" ? 0 : 1) +
    (filters.workload === "all" ? 0 : 1)
  );
}

export interface AgentFilterCounts {
  availability: Record<AgentAvailability, number>;
  workload: Record<AgentWorkload, number>;
}

/**
 * Counts for the filter menu, always taken over the *unfiltered* roster: an
 * option that reads 0 because of another facet would be a lie about the data.
 */
export function agentFilterCounts(
  agents: AgentPresenceInput[],
): AgentFilterCounts {
  const counts: AgentFilterCounts = {
    availability: { online: 0, offline: 0 },
    workload: { working: 0, queued: 0, idle: 0 },
  };
  for (const agent of agents) {
    const presence = agentPresence(agent);
    counts.availability[presence.availability] += 1;
    counts.workload[presence.workload] += 1;
  }
  return counts;
}

/** What the search box reads: the name, what the agent is for, and — on the
 * All Workspaces roster — which workspace it is in. */
export interface AgentSearchable extends AgentPresenceInput {
  name: string;
  description?: string;
  workspace_name?: string;
}

/** The roster, narrowed by both facets and the query. */
export function filterAgents<T extends AgentSearchable>(
  agents: T[],
  filters: AgentFilters,
): T[] {
  const query = filters.search.trim().toLowerCase();

  return agents.filter((agent) => {
    if (query) {
      const haystack = [agent.name, agent.description, agent.workspace_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    const presence = agentPresence(agent);
    if (
      filters.availability !== "all" &&
      presence.availability !== filters.availability
    ) {
      return false;
    }
    if (filters.workload !== "all" && presence.workload !== filters.workload) {
      return false;
    }
    return true;
  });
}
