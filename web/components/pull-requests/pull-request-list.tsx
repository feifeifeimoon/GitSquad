"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ExternalLink,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
} from "lucide-react";
import { toast } from "sonner";
import { pullRequestApi, type PullRequestSummary } from "@/lib/api";
import { formatTokens, reviewStatus } from "@/lib/pr-review";
import { paths } from "@/lib/paths";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TimeAgo } from "@/components/time-ago";
import { cn } from "@/lib/utils";

function StateIcon({ state }: { state: PullRequestSummary["state"] }) {
  if (state === "merged") {
    return <GitMerge className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />;
  }
  if (state === "closed") {
    return <GitPullRequestClosed className="size-4 shrink-0 text-mute" />;
  }
  return <GitPullRequest className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />;
}

export function PullRequestList({
  slug,
  items,
  onChanged,
}: {
  slug: string;
  items: PullRequestSummary[];
  onChanged: () => void;
}) {
  const [pending, setPending] = useState<number | null>(null);

  const startReview = async (item: PullRequestSummary) => {
    setPending(item.number);
    try {
      await pullRequestApi.review(slug, item.number);
      toast.success("Review queued.");
      onChanged();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to start the review.",
      );
    } finally {
      setPending(null);
    }
  };

  if (items.length === 0) {
    return (
      <p className="px-5 py-10 text-center text-caption text-mute">
        No pull requests yet. Open one on GitHub and it will appear here.
      </p>
    );
  }

  return (
    <ul role="list" className="divide-y divide-hairline">
      {items.map((item) => {
        const review = item.latest_review;
        const status = reviewStatus(review);
        const inFlight = review?.status === "queued" || review?.status === "running";
        return (
          <li key={item.id} className="px-5 py-3">
            <div className="flex items-center gap-2.5">
              <StateIcon state={item.state} />
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 font-mono text-caption text-mute hover:text-ink"
              >
                #{item.number}
              </a>
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-copy text-ink hover:underline"
              >
                {item.title}
              </a>
              {item.draft && <Badge variant="outline">Draft</Badge>}
              <span className="shrink-0 text-caption text-mute">{item.author}</span>
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-6 text-caption">
              {item.issue_key && (
                <Link
                  href={paths.workspace(slug).issue(item.issue_key)}
                  className="font-mono text-link hover:text-link-deep"
                >
                  {item.issue_key}
                </Link>
              )}
              <span className={cn("font-medium", status.tone)}>{status.label}</span>
              {review?.status === "completed" && (
                <span className="text-mute">
                  {review.findings} findings · {formatTokens(review.tokens)} tokens
                </span>
              )}
              <TimeAgo iso={item.updated_at} className="text-mute" />
              <span className="flex-1" />
              <Button
                variant="outline"
                size="sm"
                className="h-7"
                disabled={item.state !== "open" || inFlight || pending !== null}
                onClick={() => startReview(item)}
              >
                {pending === item.number ? "Queueing…" : "Review now"}
              </Button>
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-mute hover:text-ink"
              >
                <ExternalLink className="size-3.5" />
                GitHub
              </a>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
