"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { pullRequestApi, type PullRequestSummary } from "@/lib/api";
import { useApi } from "@/lib/query";
import { ErrorState } from "@/components/error-state";
import { PullRequestList } from "@/components/pull-requests/pull-request-list";
import { Button } from "@/components/ui/button";

type Filter = "open" | "closed" | "all";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
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
      <div className="mx-auto w-full max-w-4xl flex-1 px-8 pb-8 pt-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-title font-semibold tracking-[-0.01em] text-ink">
            Pull requests
          </h1>
          <div className="flex items-center gap-1">
            {FILTERS.map((item) => (
              <Button
                key={item.key}
                variant={filter === item.key ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setFilter(item.key)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>

        {error ? (
          <div className="mt-4">
            <ErrorState what="pull requests" error={error} onRetry={refresh} />
          </div>
        ) : loading && !data ? (
          <div className="mt-4 flex justify-center py-16">
            <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-lg border border-hairline bg-canvas shadow-level-2">
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
