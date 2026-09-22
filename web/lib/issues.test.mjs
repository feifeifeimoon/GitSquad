import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const board = readFileSync(
  new URL("../app/(app)/[slug]/page.tsx", import.meta.url),
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
    "../app/(app)/[slug]/issues/[issueKey]/page.tsx",
    import.meta.url,
  ),
  "utf8",
);
const timeline = readFileSync(
  new URL("../components/issues/issue-timeline.tsx", import.meta.url),
  "utf8",
);
const createDialog = readFileSync(
  new URL("../components/issues/create-issue-dialog.tsx", import.meta.url),
  "utf8",
);
const composer = readFileSync(
  new URL("../components/issues/comment-composer.tsx", import.meta.url),
  "utf8",
);
const title = readFileSync(
  new URL("../components/issues/issue-title.tsx", import.meta.url),
  "utf8",
);
const description = readFileSync(
  new URL("../components/issues/issue-description.tsx", import.meta.url),
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
  // The column is a neutral surface; the status colour arrives through the icon.
  assert.match(column, /StatusIcon/);
});

test("issue board supports create, empty columns, and per-column add", () => {
  assert.match(board, /New Issue/);
  assert.match(board, /CreateIssueDialog/);
  assert.match(createDialog, /issueApi\.create/);
  assert.match(createDialog, /Issue title/);
  assert.match(column, /No issues/);
  assert.match(column, /Plus/);
  assert.match(card, /issue_key/);
  // Two lines: the title and a meta row. The description preview is gone, and
  // with it the markdown-stripping pass every card used to run while rendering.
  // (No negative assertion on the removed label: these specs read the file as
  // text, so a comment that merely names the thing would fail it.)
  assert.match(card, /line-clamp-2/);
  assert.match(card, /STATUS_TONE/);
  assert.doesNotMatch(card, /stripMarkdown/);
});

test("issue board and cards use skeletons and timestamp tooltips", () => {
  assert.match(board, /Skeleton/);
  assert.match(card, /TimeAgo/);
});

test("issue board pans horizontally by dragging empty space", () => {
  assert.match(board, /onBoardMouseDown/);
  assert.match(board, /scrollLeft/);
  assert.match(board, /cursor-grab/);
  assert.match(card, /data-issue-card/);
});

test("issue mutations surface toast feedback", () => {
  // The create dialog owns its own request, so its feedback moved with it; the
  // board still reports a failed drag.
  assert.match(createDialog, /toast\.success/);
  assert.match(createDialog, /toast\.error/);
  assert.match(composer, /toast\.error/);
  assert.match(board, /toast\.error/);
  assert.match(detail, /toast\.error/);
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
  // The feed moved into its own component when it gained the jump rail; the
  // page composes the pieces rather than mapping the comments itself.
  assert.match(detail, /IssueTimeline/);
  assert.match(timeline, /comments\.map/);
  assert.match(detail, /ISSUE_STATUSES\.map/);
  // The composer is its own component now — the draft it holds is what keeps
  // typing a comment from re-parsing every comment above it.
  assert.match(composer, /Add a comment…/);
  assert.match(composer, /issueApi\.addComment/);
});

test("issue detail edits its own title and description", () => {
  // Both were write-once: the API has always accepted them and no page ever
  // sent one, so the create dialog was the only moment either could be set.
  assert.match(detail, /IssueTitle/);
  assert.match(detail, /IssueDescription/);
  assert.match(title, /issueApi\.update/);
  assert.match(description, /issueApi\.update/);
});

test("the activity rail is a way through a long feed", () => {
  assert.match(timeline, /scrollIntoView/);
  // Every tick is placed from the measured rectangle of the entry it stands
  // for, and the rail is bounded by the reader's viewport rather than by the
  // thread. Stacking one tick per entry in flow is what made it a dashed line
  // down the whole page, saying nothing about any of the entries it stood for.
  assert.match(timeline, /getBoundingClientRect/);
  assert.match(timeline, /box\.height - 64/);
  assert.match(timeline, /scrollerRef/);
  // Only worth its pixels once there is something to move through.
  assert.match(timeline, /RAIL_MIN_ENTRIES/);
});

test("a row written by the server is not given an author", () => {
  // `task.go` files "queued a task" as `type: "comment"` with
  // `author_type: "system"`, so typing on `type` alone set one server sentence
  // as prose above the name "system".
  assert.match(timeline, /author_type !== "system"/);
});
