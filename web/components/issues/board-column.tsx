"use client";

import { useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import type { Issue, IssueStatus } from "@/lib/api";
import { ISSUE_STATUS_LABELS } from "@/lib/api";
import { StatusIcon } from "@/components/status-icon";
import { DraggableIssueCard } from "./board-card";

export const COLUMN_BG: Record<IssueStatus, string> = {
  backlog: "bg-muted/40",
  todo: "bg-muted/40",
  in_progress: "bg-warning-soft",
  in_review: "bg-violet-soft",
  done: "bg-cyan-soft",
  blocked: "bg-error-soft",
  cancelled: "bg-muted/40",
};

export function BoardColumn({
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
    <div
      className={`flex min-h-full w-72 shrink-0 flex-col rounded-xl border border-hairline/50 ${COLUMN_BG[status]}`}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <StatusIcon status={status} />
        <span className="text-sm font-medium">{ISSUE_STATUS_LABELS[status]}</span>
        <span className="text-xs tabular-nums text-mute">{issues.length}</span>
        <button
          onClick={() => onCreate(status)}
          title={`Add to ${ISSUE_STATUS_LABELS[status]}`}
          className="ml-auto rounded-sm p-1 text-mute transition-colors hover:bg-white/40 hover:text-ink"
        >
          <Plus className="size-3.5" />
        </button>
      </div>
      <div
        ref={setNodeRef}
        className={`flex min-h-20 flex-1 flex-col gap-2 rounded-lg p-2 transition-colors ${
          isOver ? "bg-white/20 ring-2 ring-primary/20" : ""
        }`}
      >
        {issues.map((issue) => (
          <DraggableIssueCard key={issue.id} issue={issue} onOpen={onOpen} />
        ))}
        {issues.length === 0 && (
          <p className="py-8 text-center text-xs text-mute">No issues</p>
        )}
      </div>
    </div>
  );
}
