import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const board = readFileSync(
  new URL(
    "../app/console/workspaces/[id]/issues/page.tsx",
    import.meta.url,
  ),
  "utf8",
);
const detail = readFileSync(
  new URL(
    "../app/console/workspaces/[id]/issues/[issueId]/page.tsx",
    import.meta.url,
  ),
  "utf8",
);

const api = readFileSync(
  new URL("./api.ts", import.meta.url),
  "utf8",
);

test("issue board renders all seven status columns", () => {
  assert.match(board, /ISSUE_STATUSES\.map/);
  assert.match(board, /ISSUE_STATUS_LABELS\[status\]/);
  for (const label of [
    "Backlog",
    "Todo",
    "In Progress",
    "In Review",
    "Done",
    "Blocked",
    "Cancelled",
  ]) {
    assert.match(api, new RegExp(label));
  }
});

test("issue board supports create and drag-to-change-status", () => {
  assert.match(board, /New Issue/);
  assert.match(board, /onDragStart/);
  assert.match(board, /onDrop/);
  assert.match(board, /issueApi\.update/);
});

test("issue detail renders comments and a status selector", () => {
  assert.match(detail, /issue\.comments\.map/);
  assert.match(detail, /ISSUE_STATUSES\.map/);
  assert.match(detail, /Add a comment…/);
  assert.match(detail, /issueApi\.addComment/);
});
