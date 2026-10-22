"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { pullRequestApi, type PullRequestSummary } from "@/lib/api";
import { useApi } from "@/lib/query";
import { ErrorState } from "@/components/error-state";
import { PullRequestList } from "@/components/pull-requests/pull-request-list";
import { PageToolbar } from "@/components/page-toolbar";
import { FilterChips } from "@/components/filter-chips";

type Filter = "open" | "closed" | "all";

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" },
];

export default function PullRequestsPage() {
  const { slug } = useParams<{ slug: string }>();
  const [filter, setFilter] = useState<Filter>("open");
  const { data, error, loading, refresh } = useApi<PullRequestSummary[]>(
    `/api/v1/workspaces/${slug}/pull-requests?state=${filter}`,
    () => pullRequestApi.list(slug, filter),
  );

  useEffect(() => {
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <div className="flex h-full flex-col">
      <PageToolbar
        actions={
          <FilterChips
            label="Pull request state"
            value={filter}
            onChange={setFilter}
            items={FILTERS}
          />
        }
      />

      {/* No heading of its own: the bar above the page already names it
          "Pull requests", and two of them stacked 60px apart was the page
          saying its own name twice. */}
      <div className="mx-auto w-full max-w-4xl flex-1 px-8 pb-8 pt-2">
        {error ? (
          <ErrorState what="pull requests" error={error} onRetry={refresh} />
        ) : loading && !data ? (
          <div className="flex justify-center py-16">
            <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-hairline bg-canvas shadow-level-2">
            <PullRequestList
              slug={slug}
              items={data ?? []}
              onChanged={refresh}
            />
          </div>
        )}
      </div>
    </div>
  );
}
