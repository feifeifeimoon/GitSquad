import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const board = readFileSync(
  new URL("../app/console/workspaces/[id]/page.tsx", import.meta.url),
  "utf8",
);
const card = readFileSync(
  new URL("../components/issues/board-card.tsx", import.meta.url),
  "utf8",
);
const column = readFileSync(
  new URL("../components/issues/board-column.tsx", import.meta.url),
  "utf8",
);
const toolbar = readFileSync(
  new URL("../components/issues/issues-toolbar.tsx", import.meta.url),
  "utf8",
);
const statusIcon = readFileSync(
  new URL("../components/status-icon.tsx", import.meta.url),
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
  assert.match(column, /ISSUE_STATUS_LABELS\[status\]/);
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

test("issue board drags between columns with dnd-kit", () => {
  assert.match(board, /DndContext/);
  assert.match(board, /DragOverlay/);
  assert.match(board, /PointerSensor/);
  assert.match(board, /issueApi\.update/);
  assert.match(card, /useDraggable/);
  assert.match(column, /useDroppable/);
  assert.match(column, /COLUMN_BG/);
});

test("issue board supports create, empty columns, and per-column add", () => {
  assert.match(board, /New Issue/);
  assert.match(column, /No issues/);
  assert.match(column, /Plus/);
  assert.match(card, /issue_key/);
  assert.match(card, /Unassigned/);
});

test("issue board filters and sorts with counts", () => {
  assert.match(toolbar, /Filter/);
  assert.match(toolbar, /Assignee/);
  assert.match(toolbar, /Creator/);
  assert.match(toolbar, /Search issues…/);
  assert.match(toolbar, /SORT_LABELS/);
  assert.match(toolbar, /Clear filters/);
});

test("status icons use a self-drawn progress-ring family", () => {
  assert.match(statusIcon, /viewBox="0 0 14 14"/);
  assert.match(statusIcon, /ProgressCircle/);
  assert.match(statusIcon, /BacklogIcon/);
  assert.match(statusIcon, /DoneIcon/);
  assert.match(statusIcon, /BlockedIcon/);
});

test("issue detail renders comments and a status selector", () => {
  assert.match(detail, /issue\.comments\.map/);
  assert.match(detail, /ISSUE_STATUSES\.map/);
  assert.match(detail, /Add a comment…/);
  assert.match(detail, /issueApi\.addComment/);
});
