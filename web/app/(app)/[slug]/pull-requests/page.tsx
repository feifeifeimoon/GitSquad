"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { GitPullRequest } from "lucide-react";
import { pullRequestApi, type PullRequestSummary } from "@/lib/api";
import {
  PR_FILTERS,
  countPrs,
  filterPrs,
  selectedPr,
  type PrFilter,
} from "@/lib/pr-list";
import { invalidateApi, useApi } from "@/lib/query";
import { useMediaQuery } from "@/lib/use-media-query";
import { ErrorState } from "@/components/error-state";
import { FilterChips } from "@/components/filter-chips";
import { PageToolbar } from "@/components/page-toolbar";
import { PullRequestPeek } from "@/components/pull-requests/pull-request-peek";
import { PullRequestRows } from "@/components/pull-requests/pull-request-rows";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

/**
 * The workspace's pull requests: a dense list and the one you are looking at.
 *
 * The list used to be the whole page — one card, two lines per row, and the two
 * actions that matter (review it, open it on GitHub) repeated inside every row.
 * There was nowhere to *look* at a pull request: the only detail was the GitHub
 * link. Now the list is for scanning and the peek beside it carries the rest,
 * which is the shape of the reference tool this page is modelled on.
 *
 * Every PR is read once (`state=all`) and narrowed here, so the tabs can carry
 * counts and "Closed" can mean what GitHub means by it: closed *and* merged.
 */
export default function PullRequestsPage() {
  const { slug } = useParams<{ slug: string }>();
  const [filter, setFilter] = useState<PrFilter>("open");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<number | null>(null);
  // The peek is an aside where there is room for one, and a dialog where there
  // is not — the same content, two containers.
  const wide = useMediaQuery("(min-width: 1024px)");
  const [peekOpen, setPeekOpen] = useState(false);

  const { data, error, loading, refresh } = useApi<PullRequestSummary[]>(
    `/api/v1/workspaces/${slug}/pull-requests?state=all`,
    () => pullRequestApi.list(slug, "all"),
  );

  useEffect(() => {
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, [refresh]);

  const prs = useMemo(() => data ?? [], [data]);
  const counts = useMemo(() => countPrs(prs), [prs]);
  const visible = useMemo(() => filterPrs(prs, filter), [prs, filter]);
  const currentId = selectedPr(visible, selectedId);
  const current = visible.find((pr) => pr.id === currentId) ?? null;

  const select = (id: string) => {
    setSelectedId(id);
    if (!wide) setPeekOpen(true);
  };

  const startReview = async (pr: PullRequestSummary) => {
    setReviewing(pr.number);
    try {
      await pullRequestApi.review(slug, pr.number);
      toast.success("Review queued.");
      // A queued review is a new task on the reviewer agent and a change to the
      // linked issue. Refreshing only this list would leave the issue page and
      // the rosters serving their pre-review copy for the cache's thirty
      // seconds; the workspace prefix covers this list, the issues, the agents
      // and the cross-workspace aggregates.
      invalidateApi(`/api/v1/workspaces/${slug}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to start the review.",
      );
    } finally {
      setReviewing(null);
    }
  };

  const chips = PR_FILTERS.map((item) => ({
    value: item.value,
    label: item.label,
    count: counts[item.value],
    disabled: counts[item.value] === 0 && item.value !== filter,
  }));

  return (
    <div className="flex h-full flex-col">
      <PageToolbar
        leading={
          <FilterChips
            label="State"
            value={filter}
            onChange={(next) => setFilter(next as PrFilter)}
            items={chips}
          />
        }
        actions={
          <span className="text-caption text-mute">Recently updated</span>
        }
      />

      <div className="flex-1 px-8 pb-8 pt-2">
        {error ? (
          <ErrorState what="pull requests" error={error} onRetry={refresh} />
        ) : loading && !data ? (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="space-y-px overflow-hidden rounded-lg border border-hairline bg-canvas">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex h-10 items-center gap-3 px-3">
                  <Skeleton className="size-3.5 rounded-full" />
                  <Skeleton className="h-3 w-10" />
                  <Skeleton className="h-3 flex-1" />
                  <Skeleton className="h-3 w-16" />
                </div>
              ))}
            </div>
            <Skeleton className="hidden h-72 rounded-lg lg:block" />
          </div>
        ) : prs.length === 0 ? (
          <Empty className="py-20">
            <EmptyMedia>
              <GitPullRequest className="size-5" />
            </EmptyMedia>
            <EmptyTitle>No pull requests yet</EmptyTitle>
            <EmptyDescription>
              Open one on GitHub and it will appear here. Reviews queued from this
              page show their findings beside the pull request.
            </EmptyDescription>
          </Empty>
        ) : (
          <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="overflow-hidden rounded-lg border border-hairline bg-canvas shadow-level-2">
              {visible.length === 0 ? (
                <p className="px-3 py-12 text-center text-caption text-mute">
                  No pull requests in this state.
                </p>
              ) : (
                <PullRequestRows
                  items={visible}
                  selectedId={currentId}
                  onSelect={select}
                />
              )}
            </div>

            {current && wide && (
              <aside aria-label="Pull request">
                <PullRequestPeek
                  slug={slug}
                  pr={current}
                  busy={reviewing === current.number}
                  onReview={() => startReview(current)}
                />
              </aside>
            )}
          </div>
        )}
      </div>

      {/* Narrow: the same pane, in a dialog. */}
      {current && !wide && (
        <Dialog open={peekOpen} onOpenChange={setPeekOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogTitle className="sr-only">
              Pull request #{current.number}
            </DialogTitle>
            <PullRequestPeek
              slug={slug}
              pr={current}
              busy={reviewing === current.number}
              onReview={() => startReview(current)}
              className="border-0 shadow-none"
            />
            <Button variant="outline" onClick={() => setPeekOpen(false)}>
              Close
            </Button>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
