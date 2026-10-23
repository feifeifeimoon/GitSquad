"use client";

import Link from "next/link";
import type { PullRequestSummary } from "@/lib/api";
import { reviewStatus } from "@/lib/pr-review";
import { paths } from "@/lib/paths";
import { cn } from "@/lib/utils";
import { TimeAgo } from "@/components/time-ago";
import { PrStateIcon } from "@/components/pull-requests/pr-state-icon";

/**
 * Recent pull requests across every workspace — the workspace list's answer to
 * "what has been happening", the way a deployment feed answers it elsewhere.
 *
 * One row per PR: what state it is in, its number, what it does, which
 * workspace it belongs to (a feed that spans workspaces has to say), where the
 * review got to, and when. The whole row opens the pull request, in the
 * workspace that owns it.
 */
export function RecentPullRequests({
  items,
}: {
  items: PullRequestSummary[];
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-hairline px-3 py-6 text-center text-caption text-mute">
        No pull requests yet.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-hairline bg-canvas shadow-level-2">
      {items.map((pr) => {
        const status = reviewStatus(pr.latest_review);
        const review = pr.latest_review;
        const verdict =
          review?.status === "completed"
            ? `${status.label} · ${review.findings} finding${review.findings === 1 ? "" : "s"}`
            : status.label;

        const content = (
          <>
            <PrStateIcon state={pr.state} />
            <span className="w-12 shrink-0 font-mono text-micro text-mute">
              #{pr.number}
            </span>
            <span className="min-w-0 flex-1 truncate text-copy text-ink">
              {pr.title}
            </span>
            {pr.workspace_name && (
              <span className="hidden shrink-0 rounded-sm bg-muted px-1.5 py-px text-micro text-mute sm:inline">
                {pr.workspace_name}
              </span>
            )}
            <span className={cn("shrink-0 text-caption", status.tone)}>
              {verdict}
            </span>
            <TimeAgo
              iso={pr.updated_at}
              className="w-12 shrink-0 text-right text-caption tabular-nums text-mute"
            />
          </>
        );

        const className =
          "flex h-12 items-center gap-2.5 border-b border-hairline px-3.5 transition-colors last:border-b-0 hover:bg-muted/40";

        return pr.workspace_slug ? (
          <Link
            key={pr.id}
            href={`${paths.workspace(pr.workspace_slug).pullRequests()}?pr=${pr.number}`}
            className={className}
          >
            {content}
          </Link>
        ) : (
          <div key={pr.id} className={className}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
