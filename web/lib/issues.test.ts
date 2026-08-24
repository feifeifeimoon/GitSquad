import { describe, expect, test } from "bun:test";
import { ISSUE_STATUSES, Issue } from "./api";

function groupByStatus(issues: Issue[]) {
  return ISSUE_STATUSES.map((s) => ({
    status: s,
    issues: issues.filter((i) => i.status === s),
  }));
}

const makeIssue = (id: string, status: Issue["status"]): Issue => ({
  id, number: 1, issue_key: "GIT-1", title: id, description: "",
  status, assigned_agents: [], linked_prs: [], creator_name: "tester",
  comments_count: 0,
  created_at: "2026-08-24T00:00:00Z", updated_at: "2026-08-24T00:00:00Z",
});

describe("groupByStatus", () => {
  test("groups issues into all seven columns", () => {
    const groups = groupByStatus([
      makeIssue("a", "backlog"),
      makeIssue("b", "done"),
      makeIssue("c", "backlog"),
    ]);
    expect(groups.length).toBe(7);
    expect(groups[0].issues).toHaveLength(2); // backlog
    expect(groups[4].issues).toHaveLength(1); // done
  });
});
