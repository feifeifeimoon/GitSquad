"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { FolderGit2, GitCommitHorizontal, Lock, Plus } from "lucide-react";
import { api, Workspace } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";

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

  useEffect(() => {
    api
      .get<Workspace[]>("/api/v1/workspaces")
      .then((data) => setWorkspaces(data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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
        <h1 className="text-sm font-medium text-ink">Workspaces</h1>
        <Button onClick={() => router.push("/console/workspaces/new")}>
          <Plus className="size-4" />
          New Workspace
        </Button>
      </div>

      {workspaces.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center pb-16">
          <div className="mb-3 flex size-12 items-center justify-center rounded-lg bg-canvas-soft">
            <FolderGit2 className="size-6 text-mute" />
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
        <div className="grid grid-cols-1 gap-3 px-8 py-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {workspaces.map((w) => (
            <button
              key={w.id}
              onClick={() => router.push(`/console/workspaces/${w.id}`)}
              className="group flex flex-col rounded-lg border border-hairline bg-canvas p-4 text-left shadow-level-2 transition-all hover:border-hairline-strong hover:shadow-level-3"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-primary text-sm font-semibold text-white">
                    {w.name.slice(0, 2).toUpperCase()}
                  </div>
                  <p className="truncate text-sm font-medium text-ink">{w.name}</p>
                </div>
                <StatusBadge status={w.status} />
              </div>
              <p className="mt-1 flex items-start gap-1.5 text-xs text-body">
                <GitCommitHorizontal className="mt-0.5 size-3.5 shrink-0 text-mute" />
                <span className="line-clamp-2 min-w-0 flex-1">
                  {w.last_commit_message || "No commits yet"}
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
                    {w.repo_full_name || `${w.repo_owner}/${w.repo_name}`}
                  </span>
                  {w.repo_private && <Lock className="size-3 shrink-0 text-mute" />}
                </span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-mute">
                  {timeAgo(w.last_commit_at || w.created_at)}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
