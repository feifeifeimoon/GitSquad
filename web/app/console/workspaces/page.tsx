"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  ArrowDown,
  ArrowUp,
  FolderGit2,
  GitCommitHorizontal,
  LayoutGrid,
  List,
  Lock,
  Plus,
  Search,
} from "lucide-react";
import { api, Workspace } from "@/lib/api";
import { timeAgo } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { WorkspaceAvatar } from "@/components/workspace-avatar";

type ViewMode = "cards" | "list";
type SortKey = "name" | "created";

const VIEW_KEY = "gitsquad_workspaces_view";

export default function WorkspacesPage() {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === "list" || saved === "cards") return saved;
    }
    return "cards";
  });
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("created");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    api
      .get<Workspace[]>("/api/v1/workspaces")
      .then((data) => setWorkspaces(data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    localStorage.setItem(VIEW_KEY, view);
  }, [view]);

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
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const av = sortKey === "name" ? a.name : a.created_at;
      const bv = sortKey === "name" ? b.name : b.created_at;
      return av < bv ? -dir : av > bv ? dir : 0;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 px-8 pt-8">
        <h1 className="text-sm font-medium text-ink">Workspaces</h1>
        <div className="flex items-center gap-2">
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
          <Button onClick={() => router.push("/console/workspaces/new")}>
            <Plus className="size-4" />
            New Workspace
          </Button>
        </div>
      </div>

      {workspaces.length === 0 ? (
        <EmptyState onCreate={() => router.push("/console/workspaces/new")} />
      ) : sorted.length === 0 ? (
        <EmptyState
          icon="search"
          title="No workspaces match"
          description="Try a different search term."
        />
      ) : view === "cards" ? (
        <div className="grid grid-cols-1 gap-3 px-8 py-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sorted.map((w) => (
            <WorkspaceCard
              key={w.id}
              workspace={w}
              onOpen={() => router.push(`/console/workspaces/${w.id}`)}
            />
          ))}
        </div>
      ) : (
        <WorkspaceTable
          workspaces={sorted}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={toggleSort}
          onOpen={(id) => router.push(`/console/workspaces/${id}`)}
        />
      )}
    </div>
  );
}

function ViewSwitcher({
  view,
  onChange,
}: {
  view: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  const item = (v: ViewMode, Icon: typeof LayoutGrid, label: string) => (
    <button
      onClick={() => onChange(v)}
      title={label}
      aria-label={`${label} view`}
      className={`flex size-7 items-center justify-center rounded-sm transition-colors ${
        view === v ? "bg-muted text-ink" : "text-mute hover:text-ink"
      }`}
    >
      <Icon className="size-3.5" />
    </button>
  );
  return (
    <div className="flex items-center rounded-sm border border-hairline bg-canvas p-0.5">
      {item("cards", LayoutGrid, "Cards")}
      {item("list", List, "List")}
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
          <p className="truncate text-sm font-medium text-ink">{workspace.name}</p>
        </div>
        <StatusBadge status={workspace.status} />
      </div>
      <p className="mt-1 flex items-start gap-1.5 text-xs text-body">
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
          <span className="truncate font-mono text-xs text-mute">
            {workspace.repo_full_name ||
              `${workspace.repo_owner}/${workspace.repo_name}`}
          </span>
          {workspace.repo_private && <Lock className="size-3 shrink-0 text-mute" />}
        </span>
        <span className="shrink-0 font-mono text-xs tabular-nums text-mute">
          {timeAgo(workspace.last_commit_at || workspace.created_at)}
        </span>
      </div>
    </button>
  );
}

function SortIndicator({
  column,
  sortKey,
  sortDir,
}: {
  column: SortKey;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
}) {
  if (sortKey !== column) return null;
  return sortDir === "asc" ? (
    <ArrowUp className="size-3" />
  ) : (
    <ArrowDown className="size-3" />
  );
}

function WorkspaceTable({
  workspaces,
  sortKey,
  sortDir,
  onSort,
  onOpen,
}: {
  workspaces: Workspace[];
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (key: SortKey) => void;
  onOpen: (id: string) => void;
}) {
  const th =
    "px-4 py-2 text-left font-mono text-xs font-medium uppercase tracking-wide text-mute";

  return (
    <div className="px-8 py-6">
      <div className="overflow-hidden rounded-lg border border-hairline bg-canvas shadow-level-2">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-hairline bg-canvas-soft">
              <th className={th}>
                <button
                  onClick={() => onSort("name")}
                  className="inline-flex items-center gap-1 text-mute transition-colors hover:text-ink"
                >
                  Name
                  <SortIndicator
                    column="name"
                    sortKey={sortKey}
                    sortDir={sortDir}
                  />
                </button>
              </th>
              <th className={th}>Repository</th>
              <th className={th}>Status</th>
              <th className={th}>Last commit</th>
              <th className={`${th} text-right`}>
                <button
                  onClick={() => onSort("created")}
                  className="inline-flex items-center gap-1 text-mute transition-colors hover:text-ink"
                >
                  Created
                  <SortIndicator
                    column="created"
                    sortKey={sortKey}
                    sortDir={sortDir}
                  />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {workspaces.map((w) => (
              <tr
                key={w.id}
                onClick={() => onOpen(w.id)}
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
                  <span className="flex items-center gap-1.5 font-mono text-xs text-body">
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
                  <p className="truncate text-xs text-body">
                    {w.last_commit_message || "No commits yet"}
                  </p>
                </td>
                <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-mute">
                  {timeAgo(w.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmptyState({
  onCreate,
  icon = "folder",
  title = "No workspaces yet",
  description = "Link a GitHub repository and configure your agent team to get started.",
}: {
  onCreate?: () => void;
  icon?: "folder" | "search";
  title?: string;
  description?: string;
}) {
  const Icon = icon === "search" ? Search : FolderGit2;
  return (
    <div className="flex flex-1 flex-col items-center justify-center pb-16">
      <div className="mb-3 flex size-12 items-center justify-center rounded-lg bg-canvas-soft">
        <Icon className="size-6 text-mute" />
      </div>
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="mt-1 max-w-xs text-center text-sm text-body">{description}</p>
      {onCreate && (
        <Button onClick={onCreate} className="mt-4">
          Create your first Workspace
        </Button>
      )}
    </div>
  );
}
