"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FolderGit2,
  GitCommitHorizontal,
  Lock,
  Plus,
  Search,
  Settings,
} from "lucide-react";
import { api, Workspace } from "@/lib/api";
import { useApi } from "@/lib/query";
import { paths } from "@/lib/paths";
import { TimeAgo } from "@/components/time-ago";
import { GitHubMark } from "@/components/github-mark";
import { PageToolbar, PageToolbarSkeleton } from "@/components/page-toolbar";
import { ErrorState } from "@/components/error-state";
import { ViewSwitcher, useViewMode } from "@/components/view-switcher";
import { SortHeader, TH_CLASS, useSort, type SortState } from "@/components/table-sort";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkspaceAvatar } from "@/components/workspace-avatar";
import {
  Empty,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";

type SortKey = "name" | "created";

const VIEW_KEY = "gitsquad_workspaces_view";

export default function WorkspacesPage() {
  const router = useRouter();
  // Shared with the shell and the command palette: one request, one cache entry.
  const {
    data: workspaces = [],
    loading,
    error,
    refresh,
  } = useApi<Workspace[]>("/api/v1/workspaces", () =>
    api.get<Workspace[]>("/api/v1/workspaces"),
  );
  const [view, setView] = useViewMode(VIEW_KEY);
  const [search, setSearch] = useState("");
  const { sort, toggle: toggleSort } = useSort<SortKey>(
    { key: "created", dir: "desc" },
    "name",
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return workspaces;
    return workspaces.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        w.repo_full_name.toLowerCase().includes(q) ||
        `${w.repo_owner}/${w.repo_name}`.toLowerCase().includes(q),
    );
  }, [workspaces, search]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sort.dir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const av = sort.key === "name" ? a.name : a.created_at;
      const bv = sort.key === "name" ? b.name : b.created_at;
      return av < bv ? -dir : av > bv ? dir : 0;
    });
    return arr;
  }, [filtered, sort]);

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <PageToolbarSkeleton
          actions={
            <>
              <Skeleton className="h-8 w-56" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-8 w-32" />
            </>
          }
        />
        <div className="grid grid-cols-1 gap-3 px-8 py-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-hairline bg-canvas p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="size-8 rounded-lg" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="h-4 w-14" />
              </div>
              <Skeleton className="mt-3 h-3 w-full" />
              <Skeleton className="mt-1.5 h-3 w-2/3" />
              <div className="mt-4 flex items-center justify-between">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-16" />
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
        actions={
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-mute" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search workspaces…"
                className="h-8 w-56 pl-8"
              />
            </div>
            <ViewSwitcher view={view} onChange={setView} />
            <Button onClick={() => router.push(paths.newWorkspace())}>
              <Plus className="size-4" />
              New Workspace
            </Button>
          </>
        }
      />

      {error ? (
        <div className="px-8 py-6">
          <ErrorState what="your workspaces" error={error} onRetry={refresh} />
        </div>
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
      ) : sorted.length === 0 ? (
        <Empty className="pb-16">
          <EmptyMedia>
            <Search className="size-5" />
          </EmptyMedia>
          <EmptyTitle>No workspaces match</EmptyTitle>
          <EmptyDescription>Try a different search term.</EmptyDescription>
        </Empty>
      ) : view === "cards" ? (
        <div className="grid grid-cols-1 gap-3 px-8 py-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sorted.map((w) => (
            <WorkspaceCard
              key={w.id}
              workspace={w}
            />
          ))}
        </div>
      ) : (
        <WorkspaceTable
          workspaces={sorted}
          sort={sort}
          onSort={toggleSort}
          onOpen={(slug) => router.push(paths.workspace(slug).overview())}
        />
      )}
    </div>
  );
}

function WorkspaceCard({ workspace }: { workspace: Workspace }) {
  return (
    <div className="group relative">
      {/* A link rather than a button wired to the router: middle-click,
          open-in-new-tab, and being announced as a destination all come free —
          the same reason the sidebar's rows are links. */}
      <Link
        href={paths.workspace(workspace.slug).overview()}
        className="flex flex-col rounded-lg border border-hairline bg-canvas p-4 shadow-level-2 transition-all hover:border-hairline-strong hover:shadow-level-3"
      >
        <div className="mb-2 flex min-w-0 items-center gap-2">
          <WorkspaceAvatar
            name={workspace.name}
            avatarUrl={workspace.avatar_url}
            className="size-8"
          />
          <p className="truncate text-copy font-medium text-ink">{workspace.name}</p>
        </div>
        <p className="mt-1 flex items-start gap-1.5 text-caption text-body">
          <GitCommitHorizontal className="mt-0.5 size-3.5 shrink-0 text-mute" />
          <span className="line-clamp-2 min-w-0 flex-1">
            {workspace.last_commit_message || "No commits yet"}
          </span>
        </p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <GitHubMark className="size-3.5 shrink-0" />
            <span className="truncate font-mono text-caption text-mute">
              {workspace.repo_full_name ||
                `${workspace.repo_owner}/${workspace.repo_name}`}
            </span>
            {workspace.repo_private && <Lock className="size-3 shrink-0 text-mute" />}
          </span>
          <TimeAgo
            iso={workspace.last_commit_at || workspace.created_at}
            className="shrink-0 font-mono text-caption tabular-nums text-mute"
          />
        </div>
      </Link>

      {/* The corner held a status badge that could only ever say "Active": the
          list is filtered to the active ones before it arrives, so the word was
          the same on every card. What is here instead is the one thing the card
          cannot reach — this workspace's settings — revealed on hover or focus
          the way the issue title's pencil is, so the card stays the
          destination. Labelled with the workspace as well as the action: twelve
          cards each saying just "Workspace settings" is twelve identical names
          to anything reading the page. */}
      <Link
        href={paths.workspace(workspace.slug).settings()}
        title="Workspace settings"
        aria-label={`${workspace.name} settings`}
        className="absolute right-2.5 top-2.5 z-10 rounded-md p-1.5 text-mute opacity-0 transition-opacity hover:bg-muted hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Settings className="size-3.5" />
      </Link>
    </div>
  );
}

function WorkspaceTable({
  workspaces,
  sort,
  onSort,
  onOpen,
}: {
  workspaces: Workspace[];
  sort: SortState<SortKey>;
  onSort: (key: SortKey) => void;
  onOpen: (slug: string) => void;
}) {
  return (
    <div className="px-8 py-6">
      <div className="overflow-hidden rounded-lg border border-hairline bg-canvas shadow-level-2">
        <table className="w-full border-collapse text-copy">
          <thead>
            <tr className="border-b border-hairline bg-canvas-soft">
              <SortHeader label="Name" column="name" sort={sort} onSort={onSort} />
              <th className={TH_CLASS}>Repository</th>
              <th className={TH_CLASS}>Last commit</th>
              <SortHeader
                label="Created"
                column="created"
                sort={sort}
                onSort={onSort}
                align="right"
              />
              {/* The settings cell at the end of each row. An empty header
                  rather than none: a table whose body has more cells than its
                  head is malformed, and the extra cell would belong to no
                  column. */}
              <th className={TH_CLASS}></th>
            </tr>
          </thead>
          <tbody>
            {workspaces.map((w) => (
              <tr
                key={w.id}
                onClick={() => onOpen(w.slug)}
                className="cursor-pointer border-b border-hairline last:border-b-0 transition-colors hover:bg-muted/40"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <WorkspaceAvatar
                      name={w.name}
                      avatarUrl={w.avatar_url}
                      className="size-6"
                    />
                    <span className="truncate font-medium text-ink">{w.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-1.5 font-mono text-caption text-body">
                    <GitHubMark className="size-3.5 shrink-0" />
                    <span className="truncate">
                      {w.repo_full_name || `${w.repo_owner}/${w.repo_name}`}
                    </span>
                    {w.repo_private && <Lock className="size-3 shrink-0 text-mute" />}
                  </span>
                </td>
                <td className="max-w-0 px-4 py-3">
                  <p className="truncate text-caption text-body">
                    {w.last_commit_message || "No commits yet"}
                  </p>
                </td>
                <td className="px-4 py-3 text-right font-mono text-caption tabular-nums text-mute">
                  <TimeAgo iso={w.created_at} />
                </td>
                {/* The card's corner, in a table: the way to the workspace's
                    settings, which is the one place the row cannot get to. The
                    row itself opens the board, so this has to stop the click
                    from reaching it. */}
                <td className="px-4 py-3 text-right">
                  <Link
                    href={paths.workspace(w.slug).settings()}
                    title="Workspace settings"
                    aria-label={`${w.name} settings`}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex rounded-md p-1.5 text-mute transition-colors hover:bg-muted hover:text-ink"
                  >
                    <Settings className="size-3.5" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

