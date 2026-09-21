"use client";

import { memo } from "react";
import { useDraggable } from "@dnd-kit/core";
import { MessageSquare } from "lucide-react";
import type { Issue } from "@/lib/api";
import { TimeAgo } from "@/components/time-ago";
import { IssuePullRequestBadge } from "@/components/issues/issue-pull-requests";

// Two lines: what the issue is, and the few facts worth scanning a column for.
//
// The description preview and the "Unassigned" label are gone. Both were
// identical on nearly every card, so each cost a line of height — and the
// preview a markdown-stripping pass — without ever changing a decision. An
// unassigned issue is the default, and the default does not need saying out
// loud; what remains is rendered only when it exists.
export const IssueCard = memo(function IssueCard({
  issue,
  className,
}: {
  issue: Issue;
  className?: string;
}) {
  const assignees = issue.assigned_agents.join(", ");

  return (
    <div
      className={`rounded-lg border border-hairline bg-canvas p-3 shadow-level-1 transition-shadow hover:shadow-level-2 ${
        className ?? ""
      }`}
    >
      <p className="line-clamp-2 text-copy font-medium text-ink">
        {issue.title}
      </p>

      <div className="mt-2 flex items-center gap-2">
        <span className="shrink-0 font-mono text-micro text-mute">
          {issue.issue_key}
        </span>
        {assignees && (
          <span className="min-w-0 truncate text-micro text-body">
            {assignees}
          </span>
        )}

        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          <IssuePullRequestBadge issue={issue} />
          {issue.comments_count > 0 && (
            <span className="flex items-center gap-1 text-micro tabular-nums text-mute">
              <MessageSquare className="size-3" />
              {issue.comments_count}
            </span>
          )}
          <TimeAgo
            iso={issue.updated_at}
            className="text-micro tabular-nums text-mute"
          />
        </span>
      </div>
    </div>
  );
});

export const DraggableIssueCard = memo(function DraggableIssueCard({
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
});
