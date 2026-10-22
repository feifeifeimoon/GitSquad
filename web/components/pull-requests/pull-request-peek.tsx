"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { PullRequestSummary } from "@/lib/api";
import { formatTokens, reviewStatus } from "@/lib/pr-review";
import { paths } from "@/lib/paths";
import { cn } from "@/lib/utils";
import { TimeAgo } from "@/components/time-ago";
import { Button } from "@/components/ui/button";
import { PrStateIcon, prStateLabel } from "./pr-state-icon";

/**
 * One pull request, in full — the reading half of the page.
 *
 * It is a peek rather than a route because our PR row is thin: no comments, no
 * diff, no reviewers. A page would be a title with three facts and two buttons
 * in the middle of an empty screen; beside the list it is the answer to "what is
 * this one", which is the question the list raises.
 *
 * The review's summary is the closest thing we have to a description of the
 * change — the agent wrote it after reading the diff — so it takes the place the
 * reference gives to the PR body.
 */
export function PullRequestPeek({
  slug,
  pr,
  busy,
  onReview,
  className,
}: {
  slug: string;
  pr: PullRequestSummary;
  /** A review is being queued for this PR right now. */
  busy: boolean;
  onReview: () => void;
  className?: string;
}) {
  const review = pr.latest_review;
  const status = reviewStatus(review);
  const inFlight = review?.status === "queued" || review?.status === "running";
  const hasDiff = pr.additions > 0 || pr.deletions > 0;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-hairline bg-canvas shadow-level-2",
        className,
      )}
    >
      <div className="px-4 pb-3 pt-3.5">
        <p className="text-title-sm font-semibold leading-snug text-ink">
          {pr.title}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1.5 text-caption text-body">
            <PrStateIcon state={pr.state} />
            {prStateLabel(pr.state, pr.draft)}
          </span>
          {hasDiff && (
            <span className="font-mono text-micro">
              <span className="text-emerald-600 dark:text-emerald-400">
                +{pr.additions}
              </span>{" "}
              <span className="text-destructive">−{pr.deletions}</span>
              <span className="text-mute"> · {pr.changed_files} files</span>
            </span>
          )}
        </div>
      </div>

      <dl className="border-t border-hairline px-4 py-1.5">
        <Fact label="Author">{pr.author || "—"}</Fact>
        <Fact label="Branch">
          <span className="truncate font-mono text-micro">
            {pr.head_branch || "—"}
            <span className=" px-1 text-mute">→</span>
            {pr.base_branch || "main"}
          </span>
        </Fact>
        <Fact label="Issue">
          {pr.issue_key ? (
            <Link
              href={paths.workspace(slug).issue(pr.issue_key)}
              className="flex min-w-0 items-center gap-1.5 transition-colors hover:text-link"
            >
              <span className="shrink-0 font-mono text-micro">{pr.issue_key}</span>
              {pr.issue_title && (
                <span className="truncate text-caption text-mute">
                  {pr.issue_title}
                </span>
              )}
            </Link>
          ) : (
            <span className="text-caption text-mute">Not linked to an issue</span>
          )}
        </Fact>
        <Fact label="Updated">
          <TimeAgo iso={pr.updated_at} className="text-caption text-body" />
        </Fact>
      </dl>

      <div className="border-t border-hairline px-4 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-caption font-semibold text-ink">Review</h3>
          {review && (
            <span className="text-micro text-mute">
              @{review.agent_name} · {formatTokens(review.tokens)} tokens
            </span>
          )}
        </div>
        {review ? (
          <>
            <p className={cn("mt-1 text-caption", status.tone)}>{status.label}</p>
            {review.summary && (
              <p className="mt-2 whitespace-pre-line text-caption leading-5 text-body">
                {review.summary}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption">
              <span className="text-body">
                {review.findings} finding{review.findings === 1 ? "" : "s"}
              </span>
              {review.url && (
                <a
                  href={review.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-link transition-colors hover:text-link-deep"
                >
                  Review on GitHub
                </a>
              )}
            </div>
          </>
        ) : (
          <p className="mt-1 text-caption text-mute">Not reviewed yet.</p>
        )}
      </div>

      <div className="flex gap-2 border-t border-hairline px-4 py-3">
        <Button
          size="sm"
          className="flex-1"
          disabled={pr.state !== "open" || inFlight || busy}
          onClick={onReview}
        >
          {busy ? "Queueing…" : inFlight ? status.label : "Review now"}
        </Button>
        <Button size="sm" variant="outline" asChild>
          <a href={pr.url} target="_blank" rel="noreferrer">
            GitHub
            <ExternalLink className="size-3.5" />
          </a>
        </Button>
      </div>
    </div>
  );
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-hairline py-1.5 last:border-b-0">
      <dt className="w-16 shrink-0 pt-px text-caption text-mute">{label}</dt>
      <dd className="flex min-w-0 flex-1 items-center gap-1.5 text-caption text-body">
        {children}
      </dd>
    </div>
  );
}
