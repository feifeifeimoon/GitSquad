"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderGit2, Plus, Search } from "lucide-react";
import {
  agentApi,
  api,
  issueApi,
  pullRequestApi,
  type Agent,
  type Issue,
  type PullRequestSummary,
  type Workspace,
} from "@/lib/api";
import { useApi } from "@/lib/query";
import { repoLabel } from "@/lib/overview";
import { paths } from "@/lib/paths";
import { workspaceCards } from "@/lib/workspace-cards";
import { ErrorState } from "@/components/error-state";
import { PageToolbar, PageToolbarSkeleton } from "@/components/page-toolbar";
import { RecentPullRequests } from "@/components/workspaces/recent-pull-requests";
import { WorkspaceCardView } from "@/components/workspaces/workspace-card";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * All Workspaces: what each one is, how its work is going, and what has been
 * happening lately.
 *
 * The page used to be a card directory — name, last commit, repo, time — which
 * answered "which workspaces do I have" and nothing else. A workspace card now
 * carries the two things somebody opening this page is actually asking: how much
 * work is open and where it is stuck (the issue mix), and whether its agents are
 * running (heads plus counts). Under the cards, a feed of recent pull requests
 * says what has moved across the account since the reader last looked.
 *
 * The counts are folds over the two cross-workspace reads the board and the
 * roster already make, so this page adds no query of its own beyond the feed.
 */
export default function WorkspacesPage() {
  const router = useRouter();

  const {
    data: workspaces = [],
    loading,
    error,
    refresh,
  } = useApi<Workspace[]>("/api/v1/workspaces", () =>
    api.get<Workspace[]>("/api/v1/workspaces"),
  );
  const {
    data: issues,
    error: issuesError,
    refresh: refreshIssues,
  } = useApi<Issue[]>("/api/v1/issues", () => issueApi.listAll());
  const {
    data: agents,
    error: agentsError,
    refresh: refreshAgents,
  } = useApi<Agent[]>("/api/v1/agents", () => agentApi.listAll());
  const {
    data: recentPrs,
    error: recentPrsError,
    refresh: refreshRecentPrs,
  } = useApi<PullRequestSummary[]>(
    "/api/v1/pull-requests?limit=5",
    () => pullRequestApi.recent(5),
  );

  const [search, setSearch] = useState("");

  const cards = useMemo(
    () => workspaceCards(workspaces, issues ?? [], agents ?? []),
    [workspaces, issues, agents],
  );

  const query = search.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!query) return cards;
    return cards.filter(
      (card) =>
        card.workspace.name.toLowerCase().includes(query) ||
        card.workspace.slug.toLowerCase().includes(query) ||
        repoLabel(card.workspace).toLowerCase().includes(query),
    );
  }, [cards, query]);

  // Every block reads a different request, and a card drawn before its issues
  // arrived would say "Nothing open" for a workspace full of work. One gate for
  // the page is the honest version — and a failed read has to leave it, or the
  // skeleton is the only thing the page ever shows.
  const loadError = error ?? issuesError ?? agentsError;
  const retry = () => {
    refresh();
    refreshIssues();
    refreshAgents();
  };
  const ready =
    !loadError && !loading && issues !== undefined && agents !== undefined;

  if (!ready) {
    return (
      <div className="flex h-full flex-col">
        <PageToolbarSkeleton
          leading={<Skeleton className="h-8 w-56" />}
          actions={<Skeleton className="h-8 w-32" />}
        />
        <div className="flex-1 px-8 pb-8 pt-2">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-44 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PageToolbar
        leading={
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-mute" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search workspaces…"
              aria-label="Search workspaces"
              className="h-8 w-56 pl-8"
            />
          </div>
        }
        actions={
          <Button onClick={() => router.push(paths.newWorkspace())}>
            <Plus className="size-4" />
            New Workspace
          </Button>
        }
      />

      <div className="flex-1 px-8 pb-8 pt-2">
        {loadError ? (
          <ErrorState what="your workspaces" error={loadError} onRetry={retry} />
        ) : workspaces.length === 0 ? (
          <Empty className="pb-16">
            <EmptyMedia>
              <FolderGit2 className="size-5" />
            </EmptyMedia>
            <EmptyTitle>No workspaces yet</EmptyTitle>
            <EmptyDescription>
              Link a GitHub repository and configure your agent team to get
              started.
            </EmptyDescription>
            <Button
              onClick={() => router.push(paths.newWorkspace())}
              className="mt-1"
            >
              Create your first Workspace
            </Button>
          </Empty>
        ) : (
          <div className="space-y-7">
            <section>
              {/* No heading here: the bar above the page already says
                  "Workspaces", and two identical titles on one screen is the
                  page saying its own name twice. */}
              {visible.length === 0 ? (
                <p className="rounded-lg border border-dashed border-hairline px-3 py-6 text-center text-caption text-mute">
                  No workspaces match this search.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {visible.map((card) => (
                    <WorkspaceCardView key={card.workspace.id} card={card} />
                  ))}
                </div>
              )}
            </section>

            <section>
              <SectionHead
                title="Recent pull requests"
                note={`across ${workspaces.length} workspace${workspaces.length === 1 ? "" : "s"}`}
              />
              {recentPrsError ? (
                <p className="rounded-lg border border-dashed border-hairline px-3 py-6 text-center text-caption text-mute">
                  Couldn&apos;t load recent pull requests.{" "}
                  <button
                    onClick={refreshRecentPrs}
                    className="text-body underline-offset-2 hover:text-ink hover:underline"
                  >
                    Try again
                  </button>
                </p>
              ) : recentPrs === undefined ? (
                <div className="space-y-1.5">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-md" />
                  ))}
                </div>
              ) : (
                <RecentPullRequests items={recentPrs} />
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

/** A block heading: the name, then a quiet count or scope beside it. */
function SectionHead({ title, note }: { title: string; note?: string }) {
  return (
    <div className="mb-2.5 flex items-baseline gap-2">
      <h2 className="text-label font-semibold text-ink">{title}</h2>
      {note && <span className="text-caption text-mute">{note}</span>}
    </div>
  );
}
