"use client";

import { memo } from "react";
import Link from "next/link";
import { useDraggable } from "@dnd-kit/core";
import { MessageSquare } from "lucide-react";
import type { Issue } from "@/lib/api";
import { paths } from "@/lib/paths";
import { AgentStack } from "@/components/issues/agent-chip";
import { IssuePullRequestBadge } from "@/components/issues/issue-pull-requests";
import { STATUS_TONE } from "@/components/status-icon";

// Two lines: what the issue is, and the few facts worth scanning a column for.
//
// The description preview and the "Unassigned" label are gone. Both were
// identical on nearly every card, so each cost a line of height — and the
// preview a markdown-stripping pass — without ever changing a decision. An
// unassigned issue is the default, and the default does not need saying out
// loud; what remains is rendered only when it exists.
//
// The status is the accent down the left edge. The column already says which
// status a card is in, but the eye scanning a board reads cards, not column
// heads — and a column head that has scrolled out of view, or a card mid-drag,
// says nothing at all. A 2px edge carries it without a fill, so the colour
// never becomes the surface.
//
// The agents are avatars, not a joined list of names: a name is as wide as it
// is long and pushed the rest of the row around, while a stack is the same
// width for one agent or four — and it is how every other screen in the console
// shows who an agent is.
//
// The timestamp is gone. It was the last item in a one-line row that has to fit
// the key, the agents, the pull request and the comment count, and on a card
// with all four it was the thing that got clipped — "27m a" — as soon as the
// board stopped being 288px columns. It is also the least decisive of the five:
// almost every card says "recently", and the question it answers is already on
// the overview's Active list and on the issue's own rail. The board is for
// triage: what it is, who is on it, whether it has a branch, whether anyone has
// replied.
export const IssueCard = memo(function IssueCard({
  issue,
  className,
}: {
  issue: Issue;
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-lg border border-hairline bg-canvas p-3 pl-3.5 shadow-level-1 transition-shadow hover:shadow-level-2 ${
        className ?? ""
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 w-0.5 ${STATUS_TONE[issue.status].bar}`}
      />

      {/* Only the All Workspaces board knows one: a board inside a workspace
          has nothing to disambiguate, so the field is absent and nothing is
          drawn. Here it has to be, because the key is not enough on its own —
          numbers are per workspace and two of them can both be "GS-1".

          Its own line rather than a chip in the row below: that row is the
          facts worth scanning a column for, and on a card with agents, a PR and
          comment count it had no width left — the name came out as "O…". A line
          it is, on the one board where it says something new. */}
      {issue.workspace_name ? (
        <p className="mb-1.5 truncate text-micro font-medium text-body">
          {issue.workspace_name}
        </p>
      ) : null}

      <p className="line-clamp-2 text-copy font-medium text-ink">
        {issue.title}
      </p>

      <div className="mt-2 flex items-center gap-2">
        <span className="shrink-0 font-mono text-micro text-mute">
          {issue.issue_key}
        </span>

        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          <AgentStack agents={issue.agents} />
          <IssuePullRequestBadge issue={issue} />
          {issue.comments_count > 0 && (
            <span className="flex items-center gap-1 text-micro tabular-nums text-mute">
              <MessageSquare className="size-3" />
              {issue.comments_count}
            </span>
          )}
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
      onKeyDown={(event) => {
        // dnd-kit already makes this a tab stop (role="button", tabIndex 0),
        // but the board registers only a pointer sensor — so every card was a
        // tab stop where nothing happened. Enter opens the issue, which is
        // where the status control is; the keyboard path to moving work runs
        // through that rather than through a drag it cannot perform.
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(issue.issue_key);
        }
      }}
      className={`cursor-grab rounded-lg active:cursor-grabbing ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <IssueCard issue={issue} />
    </div>
  );
});

/**
 * The card on a board that does not drag: the All Workspaces one, where a drop
 * would mean changing the status of an issue in a workspace the board is not in.
 *
 * A link rather than a div with a click handler, because that is what it is —
 * it goes to the issue, in the workspace that owns it. Middle-click works,
 * "open in new tab" works, and a screen reader reads it as a destination. The
 * draggable card cannot be one *and* a drag handle, which is why the two
 * behaviours are two components rather than one with a flag: dnd-kit marks its
 * nodes `aria-disabled`, and a card that says it is disabled while it is the
 * only way into the issue is a lie the DOM does not need to tell.
 */
export const LinkedIssueCard = memo(function LinkedIssueCard({
  issue,
}: {
  issue: Issue;
}) {
  const href = issue.workspace_slug
    ? paths.workspace(issue.workspace_slug).issue(issue.issue_key)
    : null;
  if (!href) return <IssueCard issue={issue} />;
  return (
    <Link href={href} data-issue-card className="block rounded-lg">
      <IssueCard issue={issue} />
    </Link>
  );
});
