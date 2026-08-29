"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ChevronDown,
  ChevronUp,
  Lock,
  Plus,
  Search,
} from "lucide-react";
import { api, Workspace } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";

type SortField = "name" | "created_at";
type SortDir = "asc" | "desc";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function WorkspacesPage() {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    api
      .get<Workspace[]>("/api/v1/workspaces")
      .then((data) => setWorkspaces(data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleArchive = async (id: string) => {
    try {
      await api.delete(`/api/v1/workspaces/${id}`);
      setWorkspaces((prev) => prev.filter((w) => w.id !== id));
    } catch {
      // ignore
    }
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = workspaces.filter((w) => {
      if (!q) return true;
      const repo = w.repo_full_name || `${w.repo_owner}/${w.repo_name}`;
      return w.name.toLowerCase().includes(q) || repo.toLowerCase().includes(q);
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortField === "name") return a.name.localeCompare(b.name) * dir;
      return (Date.parse(a.created_at) - Date.parse(b.created_at)) * dir;
    });
  }, [workspaces, search, sortField, sortDir]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDir === "asc" ? (
      <ChevronUp className="size-3" />
    ) : (
      <ChevronDown className="size-3" />
    );
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
      <div className="flex items-center justify-between px-8 pt-8">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-medium text-ink">Workspaces</h1>
          <span className="font-mono text-xs tabular-nums text-mute">
            {workspaces.length}
          </span>
        </div>
        <Button onClick={() => router.push("/console/workspaces/new")}>
          <Plus className="size-4" />
          New Workspace
        </Button>
      </div>

      {workspaces.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center pb-16">
          <div className="mb-3 flex size-12 items-center justify-center rounded-lg bg-canvas-soft">
            <Plus className="size-6 text-mute" />
          </div>
          <p className="text-sm font-medium text-ink">No workspaces yet</p>
          <p className="mt-1 max-w-xs text-center text-sm text-body">
            Link a GitHub repository and configure your agent team to get started.
          </p>
          <Button
            onClick={() => router.push("/console/workspaces/new")}
            className="mt-4"
          >
            Create your first Workspace
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-center px-8 py-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-mute" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search workspaces…"
                className="h-8 w-64 pl-8"
              />
            </div>
          </div>

          <div className="flex-1 overflow-auto px-8 pb-8">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-hairline">
                  <th className="py-2 pr-4">
                    <button
                      onClick={() => toggleSort("name")}
                      className="flex items-center gap-1 text-xs font-medium text-mute transition-colors hover:text-ink"
                    >
                      Name <SortIcon field="name" />
                    </button>
                  </th>
                  <th className="py-2 pr-4 text-xs font-medium text-mute">Repository</th>
                  <th className="py-2 pr-4 text-xs font-medium text-mute">Status</th>
                  <th className="py-2 pr-4">
                    <button
                      onClick={() => toggleSort("created_at")}
                      className="flex items-center gap-1 text-xs font-medium text-mute transition-colors hover:text-ink"
                    >
                      Created <SortIcon field="created_at" />
                    </button>
                  </th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {visible.map((w) => (
                  <tr
                    key={w.id}
                    onClick={() => router.push(`/console/workspaces/${w.id}`)}
                    className="group cursor-pointer border-b border-hairline transition-colors hover:bg-canvas-soft"
                  >
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-3">
                        <div className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-primary text-xs font-semibold text-white">
                          {w.name.slice(0, 2).toUpperCase()}
                        </div>
                        <span className="truncate text-sm font-medium text-ink">
                          {w.name}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-mono text-xs text-body">
                          {w.repo_full_name || `${w.repo_owner}/${w.repo_name}`}
                        </span>
                        {w.repo_private && (
                          <Lock className="size-3 shrink-0 text-mute" />
                        )}
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <StatusBadge status={w.status} />
                    </td>
                    <td className="py-3 font-mono text-xs tabular-nums text-body">
                      {timeAgo(w.created_at)}
                    </td>
                    <td className="py-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleArchive(w.id);
                        }}
                        className="rounded-sm p-1.5 text-mute opacity-0 transition-all hover:bg-muted hover:text-ink group-hover:opacity-100"
                        title="Archive workspace"
                      >
                        <Archive className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visible.length === 0 && (
              <div className="py-12 text-center text-sm text-mute">
                No workspaces match your search.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
