"use client";

import { memo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import type { Issue, IssueStatus } from "@/lib/api";
import { ISSUE_STATUS_LABELS } from "@/lib/api";
import { StatusIcon } from "@/components/status-icon";
import { DraggableIssueCard, LinkedIssueCard } from "./board-card";

// Columns are neutral surfaces, and the status colour lives in the icon beside
// the label. Painting the whole column was the loudest thing on the board and
// said one word — "this one is yellow" — across a third of the viewport; the
// colour is a fact about the work, so it belongs on the work's own marker.
//
// The width is the flex row's, not a fixed 288px. At a fixed width seven
// columns measured 2176px, so a 1440px window showed four and a half of them
// and Done sat behind a horizontal scroll nobody could see a reason for. A
// column with work now takes an equal share of the row and stops shrinking at
// 12rem — the width at which five populated columns and two collapsed strips
// fit a 1440px window, with room for the card's own one-line fact row. A column
// with no work collapses to a 48px strip. Two or three empty statuses are normal
// on a working board, and the strips are what leave the room for the columns
// that have cards.
//
// The surface is the theme's well tone: `canvas-soft-2` in light (a step darker
// than the page, so the column reads as sunk) and `canvas-soft` in dark (the
// same idea, inverted — the dark ladder's --canvas-soft is the darker plane).
// Both used to be a token that sat within five units of the page, which is why
// the board looked like cards floating on one flat field.
const COLUMN =
  "flex min-h-full flex-col rounded-xl border border-hairline bg-canvas-soft-2 dark:bg-canvas-soft";
const STRIP =
  "flex min-h-full w-12 shrink-0 flex-col items-center gap-2 rounded-xl border border-hairline bg-canvas-soft-2 py-3 text-mute dark:bg-canvas-soft";

export const BoardColumn = memo(function BoardColumn({
  status,
  issues,
  onCreate,
  onOpen,
  mode = "drag",
}: {
  status: IssueStatus;
  issues: Issue[];
  /**
   * Absent on the All Workspaces board, which has no workspace to add an issue
   * to. The button is left out rather than drawn doing nothing.
   */
  onCreate?: (status: IssueStatus) => void;
  /** Only used in "drag" mode; a linked card carries its own destination. */
  onOpen?: (id: string) => void;
  /**
   * What a card in this column is. "drag" is a board inside a workspace, where
   * dropping means moving that workspace's issue; "link" is the All Workspaces
   * board, where a card opens its issue in the workspace that owns it and
   * cannot mean anything else.
   */
  mode?: "drag" | "link";
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
    data: { type: "column", status },
    // Nothing can be dropped here in "link" mode, and the aggregate board has no
    // DndContext above it at all: the column is a container, not a target.
    disabled: mode === "link",
  });
  const label = ISSUE_STATUS_LABELS[status];

  // An empty column is a strip you can still drop onto, and — where creating is
  // possible — a button that opens the new-issue dialog in this status. It
  // carries the count it does not have, so a collapsed column still answers
  // "how much is in Done" without being opened.
  //
  // The name runs down the strip rather than away from it: a 48px column with
  // only an icon and a zero is a mystery until you hover, and the one thing a
  // collapsed column still has to say is *which* status it is. Vertical type is
  // what a closed lane looks like on a board; a tooltip is not a label.
  if (issues.length === 0) {
    const inner = (
      <>
        <StatusIcon status={status} />
        {/* The name sits directly under the icon rather than floating in the
            middle of the strip: the two together are the column's head, and the
            count and the add button belong to the foot. */}
        <span className="min-h-0 overflow-hidden">
          <span className="rotate-180 text-micro font-medium tracking-wide [writing-mode:vertical-rl]">
            {label}
          </span>
        </span>
        <span className="flex-1" />
        <span className="text-micro tabular-nums">0</span>
        {onCreate && <Plus className="mt-0.5 size-3.5" />}
      </>
    );

    if (!onCreate) {
      return (
        <div className={STRIP} title={`No issues in ${label}`}>
          {inner}
        </div>
      );
    }

    return (
      <button
        ref={setNodeRef}
        type="button"
        onClick={() => onCreate(status)}
        title={`Add an issue to ${label}`}
        aria-label={`Add an issue to ${label}`}
        className={`${STRIP} cursor-pointer transition-colors hover:border-hairline-strong hover:text-ink ${
          isOver ? "ring-2 ring-ring/25" : ""
        }`}
      >
        {inner}
      </button>
    );
  }

  return (
    <div className={`${COLUMN} min-w-[12rem] flex-1`}>
      {/* Pinned inside the column, against the board's own scroller: a long
          column scrolls its cards under the label instead of taking the label
          with them. The hairline is what separates the two once they overlap. */}
      <div className="sticky top-0 z-10 flex items-center gap-2 rounded-t-xl border-b border-hairline bg-canvas-soft-2 px-3 py-2.5 dark:bg-canvas-soft">
        <StatusIcon status={status} />
        <span className="text-label font-semibold text-ink">{label}</span>
        <span className="text-caption tabular-nums text-mute">
          {issues.length}
        </span>
        {onCreate && (
          <button
            onClick={() => onCreate(status)}
            title={`Add to ${label}`}
            aria-label={`Add to ${label}`}
            className="ml-auto rounded-sm p-1 text-mute transition-colors hover:bg-muted hover:text-ink"
          >
            <Plus className="size-3.5" />
          </button>
        )}
      </div>
      <div
        ref={setNodeRef}
        className={`flex min-h-20 flex-1 flex-col gap-2 rounded-lg p-2 transition-colors ${
          isOver ? "bg-muted ring-2 ring-ring/25" : ""
        }`}
      >
        {issues.map((issue) =>
          mode === "link" || !onOpen ? (
            <LinkedIssueCard key={issue.id} issue={issue} />
          ) : (
            <DraggableIssueCard key={issue.id} issue={issue} onOpen={onOpen} />
          ),
        )}
      </div>
    </div>
  );
});
