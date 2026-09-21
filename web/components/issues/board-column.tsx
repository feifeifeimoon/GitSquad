"use client";

import { memo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import type { Issue, IssueStatus } from "@/lib/api";
import { ISSUE_STATUS_LABELS } from "@/lib/api";
import { StatusIcon } from "@/components/status-icon";
import { DraggableIssueCard } from "./board-card";

// Columns are neutral surfaces, and the status colour lives in the icon beside
// the label. Painting the whole column was the loudest thing on the board and
// said one word — "this one is yellow" — across a third of the viewport; the
// colour is a fact about the work, so it belongs on the work's own marker.
//
// Memoized alongside the cards: the board groups issues into stable per-status
// arrays and passes stable callbacks, so a change that belongs to one column no
// longer walks all seven.
export const BoardColumn = memo(function BoardColumn({
  status,
  issues,
  onCreate,
  onOpen,
}: {
  status: IssueStatus;
  issues: Issue[];
  onCreate: (status: IssueStatus) => void;
  onOpen: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
    data: { type: "column", status },
  });

  return (
    <div className="flex min-h-full w-72 shrink-0 flex-col rounded-xl border border-hairline bg-canvas-soft">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <StatusIcon status={status} />
        <span className="text-label font-semibold text-ink">
          {ISSUE_STATUS_LABELS[status]}
        </span>
        <span className="text-caption tabular-nums text-mute">
          {issues.length}
        </span>
        <button
          onClick={() => onCreate(status)}
          title={`Add to ${ISSUE_STATUS_LABELS[status]}`}
          aria-label={`Add to ${ISSUE_STATUS_LABELS[status]}`}
          className="ml-auto rounded-sm p-1 text-mute transition-colors hover:bg-muted hover:text-ink"
        >
          <Plus className="size-3.5" />
        </button>
      </div>
      <div
        ref={setNodeRef}
        className={`flex min-h-20 flex-1 flex-col gap-2 rounded-lg p-2 transition-colors ${
          isOver ? "bg-muted ring-2 ring-ring/25" : ""
        }`}
      >
        {issues.map((issue) => (
          <DraggableIssueCard key={issue.id} issue={issue} onOpen={onOpen} />
        ))}
        {issues.length === 0 && (
          <p className="py-8 text-center text-caption text-mute">No issues</p>
        )}
      </div>
    </div>
  );
});
