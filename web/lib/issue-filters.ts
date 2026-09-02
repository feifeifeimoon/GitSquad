import type { Issue, IssueStatus } from "@/lib/api";

export interface IssueFilters {
  statuses: IssueStatus[];
  assignees: string[];
  creators: string[];
  search: string;
}

export const EMPTY_FILTERS: IssueFilters = {
  statuses: [],
  assignees: [],
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
    if (f.assignees.length > 0) {
      const matched = f.assignees.some((a) => issue.assigned_agents.includes(a));
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
  assignees: string[];
  creators: string[];
} {
  const assignees = new Set<string>();
  const creators = new Set<string>();
  for (const issue of issues) {
    for (const a of issue.assigned_agents) assignees.add(a);
    if (issue.creator_name) creators.add(issue.creator_name);
  }
  return {
    assignees: [...assignees].sort(),
    creators: [...creators].sort(),
  };
}
