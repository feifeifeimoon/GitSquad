import type { Issue, IssueStatus } from "@/lib/api";

export interface IssueFilters {
  statuses: IssueStatus[];
  /** Agent ids, not names: the roster is the source of names, and a name can
   * change while an id cannot. */
  agents: string[];
  creators: string[];
  search: string;
}

export const EMPTY_FILTERS: IssueFilters = {
  statuses: [],
  agents: [],
  creators: [],
  search: "",
};

export type SortField = "created_at" | "updated_at" | "title";

export interface SortState {
  field: SortField;
  dir: "asc" | "desc";
}

export const DEFAULT_SORT: SortState = { field: "created_at", dir: "asc" };

export function filterIssues(issues: Issue[], f: IssueFilters): Issue[] {
  const q = f.search.trim().toLowerCase();
  return issues.filter((issue) => {
    if (f.statuses.length > 0 && !f.statuses.includes(issue.status)) return false;
    if (f.agents.length > 0) {
      const matched = f.agents.some((id) => issue.agents.some((a) => a.id === id));
      if (!matched) return false;
    }
    if (f.creators.length > 0 && !f.creators.includes(issue.creator_name)) return false;
    if (q) {
      const hay = `${issue.issue_key} ${issue.title} ${issue.description}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function sortIssues(issues: Issue[], sort: SortState): Issue[] {
  const arr = [...issues];
  const dir = sort.dir === "asc" ? 1 : -1;
  arr.sort((a, b) => {
    const av =
      sort.field === "title"
        ? a.title.toLowerCase()
        : a[sort.field] ?? "";
    const bv =
      sort.field === "title"
        ? b.title.toLowerCase()
        : b[sort.field] ?? "";
    return av < bv ? -dir : av > bv ? dir : 0;
  });
  return arr;
}

export function collectFilterOptions(issues: Issue[]): {
  agents: { id: string; name: string }[];
  creators: string[];
} {
  // Keyed by id, labelled from the payload: the filter is about the agent, not
  // about whatever it happened to be called on the day.
  const agents = new Map<string, string>();
  const creators = new Set<string>();
  for (const issue of issues) {
    for (const a of issue.agents) agents.set(a.id, a.name);
    if (issue.creator_name) creators.add(issue.creator_name);
  }
  return {
    agents: [...agents.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    creators: [...creators].sort(),
  };
}
