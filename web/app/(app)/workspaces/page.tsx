"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  FolderGit2,
  GitCommitHorizontal,
  Lock,
  Plus,
  Search,
} from "lucide-react";
import { api, Workspace } from "@/lib/api";
import { paths } from "@/lib/paths";
import { TimeAgo } from "@/components/time-ago";
import { PageHeader, PageHeaderSkeleton } from "@/components/page-header";
import { ViewSwitcher, useViewMode } from "@/components/view-switcher";
import { SortHeader, TH_CLASS, useSort, type SortState } from "@/components/table-sort";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
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
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useViewMode(VIEW_KEY);
  const [search, setSearch] = useState("");
  const { sort, toggle: toggleSort } = useSort<SortKey>(
    { key: "created", dir: "desc" },
    "name",
  );

  useEffect(() => {
    api
      .get<Workspace[]>("/api/v1/workspaces")
      .then((data) => setWorkspaces(data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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
        <PageHeaderSkeleton
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
      <PageHeader
        title="Workspaces"
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

      {workspaces.length === 0 ? (
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
              onOpen={() => router.push(paths.workspace(w.slug).board())}
            />
          ))}
        </div>
      ) : (
        <WorkspaceTable
          workspaces={sorted}
          sort={sort}
          onSort={toggleSort}
          onOpen={(slug) => router.push(paths.workspace(slug).board())}
        />
      )}
    </div>
  );
}

function WorkspaceCard({
  workspace,
  onOpen,
}: {
  workspace: Workspace;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      className="group flex flex-col rounded-lg border border-hairline bg-canvas p-4 text-left shadow-level-2 transition-all hover:border-hairline-strong hover:shadow-level-3"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <WorkspaceAvatar
            name={workspace.name}
            avatarUrl={workspace.avatar_url}
            className="size-8"
          />
          <p className="truncate text-copy font-medium text-ink">{workspace.name}</p>
        </div>
        <StatusBadge status={workspace.status} />
      </div>
      <p className="mt-1 flex items-start gap-1.5 text-caption text-body">
        <GitCommitHorizontal className="mt-0.5 size-3.5 shrink-0 text-mute" />
        <span className="line-clamp-2 min-w-0 flex-1">
          {workspace.last_commit_message || "No commits yet"}
        </span>
      </p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <Image
            src="/logo-github-light.svg"
            alt="GitHub"
            width={14}
            height={14}
            className="size-3.5 shrink-0"
          />
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
    </button>
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
              <th className={TH_CLASS}>Status</th>
              <th className={TH_CLASS}>Last commit</th>
              <SortHeader
                label="Created"
                column="created"
                sort={sort}
                onSort={onSort}
                align="right"
              />
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
                    <Image
                      src="/logo-github-light.svg"
                      alt="GitHub"
                      width={14}
                      height={14}
                      className="size-3.5 shrink-0"
                    />
                    <span className="truncate">
                      {w.repo_full_name || `${w.repo_owner}/${w.repo_name}`}
                    </span>
                    {w.repo_private && <Lock className="size-3 shrink-0 text-mute" />}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={w.status} />
                </td>
                <td className="max-w-0 px-4 py-3">
                  <p className="truncate text-caption text-body">
                    {w.last_commit_message || "No commits yet"}
                  </p>
                </td>
                <td className="px-4 py-3 text-right font-mono text-caption tabular-nums text-mute">
                  <TimeAgo iso={w.created_at} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

