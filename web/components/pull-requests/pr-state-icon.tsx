"use client";

import { GitMerge, GitPullRequest, GitPullRequestClosed } from "lucide-react";
import { cn } from "@/lib/utils";

// One drawing of a pull request's state, shared by the row and the peek so the
// list and the pane cannot disagree about what "merged" looks like.
//
// The colour is the console's own: green for a branch that is live, mute for one
// that is not. Merged and open share the green on purpose — both are "this
// exists on the remote" — and the icon plus the written label carry the
// difference, which is the same rule every other status in the console follows.

export type PrState = "open" | "merged" | "closed";

export const PR_STATE_LABEL: Record<PrState, string> = {
  open: "Open",
  merged: "Merged",
  closed: "Closed",
};

const TONE: Record<PrState, string> = {
  open: "text-emerald-600 dark:text-emerald-400",
  merged: "text-emerald-600 dark:text-emerald-400",
  closed: "text-mute",
};

export function PrStateIcon({
  state,
  className,
}: {
  state: PrState;
  className?: string;
}) {
  const Icon =
    state === "merged"
      ? GitMerge
      : state === "closed"
        ? GitPullRequestClosed
        : GitPullRequest;
  return (
    <Icon
      className={cn("size-3.5 shrink-0", TONE[state], className)}
      aria-hidden="true"
    />
  );
}

export function prStateLabel(
  state: PrState,
  draft: boolean,
): string {
  if (state === "open" && draft) return "Draft";
  return PR_STATE_LABEL[state];
}
