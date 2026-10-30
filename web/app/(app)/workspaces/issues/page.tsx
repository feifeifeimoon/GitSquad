"use client";

import { useMemo, useState } from "react";
import { Issue, ISSUE_STATUSES, issueApi, type IssueStatus } from "@/lib/api";
import { paths } from "@/lib/paths";
import { useApi } from "@/lib/query";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/error-state";
import { BoardColumn } from "@/components/issues/board-column";
import { IssuesToolbar } from "@/components/issues/issues-toolbar";
import { PageToolbar, PageToolbarSkeleton } from "@/components/page-toolbar";
import {
  DEFAULT_SORT,
  EMPTY_FILTERS,
  filterIssues,
  sortIssues,
  type IssueFilters,
  type SortState,
} from "@/lib/issue-filters";

/**
 * The All Workspaces board: every issue in every workspace you own, in one
 * board.
 *
 * It is the first page in the console that reads across workspaces, and the
 * reason the scope switcher exists — the queue does not stop at a workspace
 * boundary, and the alternative was opening each workspace in turn to find out
 * what is moving.
 *
 * Read-only, deliberately and visibly: there is no create button and cards do
 * not drag, because both would have to name a workspace the board is not in.
 * Both are left out rather than drawn doing nothing — a card here opens its
 * issue, which is where the status and the assignee are, and the issue's own
 * page is inside the workspace that owns it.
 */
export default function AllIssuesPage() {
  const {
    data: issues,
    loading,
    error,
    refresh,
  } = useApi<Issue[]>("/api/v1/issues", () => issueApi.listAll());
  const [filters, setFilters] = useState<IssueFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);

  const visibleIssues = useMemo(
    () => sortIssues(filterIssues(issues ?? [], filters), sort),
    [issues, filters, sort],
  );

  const byStatus = useMemo(() => {
    const map = Object.fromEntries(
      ISSUE_STATUSES.map((s) => [s, [] as Issue[]]),
    ) as Record<IssueStatus, Issue[]>;
    for (const issue of visibleIssues) map[issue.status].push(issue);
    return map;
  }, [visibleIssues]);

  if (error) {
    return (
      <div className="p-8">
        <ErrorState
          what="issues"
          error={error}
          onRetry={refresh}
          notFoundHref={paths.workspaces()}
          notFoundLabel="Go to workspaces"
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <PageToolbarSkeleton
          leading={
            <>
              <Skeleton className="h-8 w-52" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-20" />
            </>
          }
        />
        <div className="flex flex-1 gap-3 overflow-x-auto px-8 pb-8 pt-2">
          {ISSUE_STATUSES.map((status) => (
            <div
              key={status}
              className="min-w-[12rem] flex-1 rounded-xl border border-hairline bg-canvas-soft-2 p-2 dark:bg-canvas-soft"
            >
              <div className="flex items-center gap-2 px-1.5 py-2">
                <Skeleton className="size-3.5 rounded-full" />
                <Skeleton className="h-4 w-20" />
              </div>
              <div className="space-y-2 p-1">
                <Skeleton className="h-24 w-full rounded-lg" />
                <Skeleton className="h-24 w-full rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PageToolbar
        leading={
          <IssuesToolbar
            issues={issues ?? []}
            filters={filters}
            onFiltersChange={setFilters}
            sort={sort}
            onSortChange={setSort}
          />
        }
      />

      <div className="flex flex-1 gap-3 overflow-x-auto px-8 pb-8 pt-2">
        {ISSUE_STATUSES.map((status) => (
          <BoardColumn
            key={status}
            status={status}
            issues={byStatus[status]}
            mode="link"
          />
        ))}
      </div>
    </div>
  );
}
