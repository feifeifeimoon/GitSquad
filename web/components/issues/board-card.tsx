"use client";

import { useDraggable } from "@dnd-kit/core";
import { MessageSquare } from "lucide-react";
import type { Issue } from "@/lib/api";
import { TimeAgo } from "@/components/time-ago";
import { stripMarkdown } from "@/lib/utils";

export function IssueCard({
  issue,
  className,
}: {
  issue: Issue;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-hairline bg-card p-3 shadow-level-2 transition-shadow hover:shadow-level-3 ${
        className ?? ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs tabular-nums text-mute">
          {issue.issue_key}
        </span>
        {issue.comments_count > 0 && (
          <span className="flex items-center gap-1 text-xs tabular-nums text-mute">
            <MessageSquare className="size-3" />
            {issue.comments_count}
          </span>
        )}
      </div>
      <p className="mt-1 line-clamp-2 text-sm font-medium text-ink">
        {issue.title}
      </p>
      {issue.description ? (
        <p className="mt-1 line-clamp-1 text-xs text-body">
          {stripMarkdown(issue.description)}
        </p>
      ) : null}
      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        <span className="truncate text-body">
          {issue.assigned_agents.length > 0
            ? issue.assigned_agents.join(", ")
            : "Unassigned"}
        </span>
        <TimeAgo
          iso={issue.updated_at}
          className="shrink-0 tabular-nums text-mute"
        />
      </div>
    </div>
  );
}

export function DraggableIssueCard({
  issue,
  onOpen,
}: {
  issue: Issue;
  onOpen: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: issue.id,
    data: { status: issue.status, type: "issue" },
  });

  return (
    <div
      ref={setNodeRef}
      data-issue-card
      {...listeners}
      {...attributes}
      onClick={() => onOpen(issue.issue_key)}
      className={`cursor-grab active:cursor-grabbing ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <IssueCard issue={issue} />
    </div>
  );
}
