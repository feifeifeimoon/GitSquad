"use client";

import { use, useEffect, useState } from "react";
import Image from "next/image";
import { Lock } from "lucide-react";
import { api, Workspace } from "@/lib/api";
import { timeAgo } from "@/lib/time";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";

export default function WorkspaceOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Workspace>(`/api/v1/workspaces/${id}`)
      .then(setWorkspace)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading || !workspace) {
    return (
      <div className="grid gap-4 px-8 py-6 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-hairline bg-canvas p-5"
          >
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-4 h-5 w-40" />
            <Skeleton className="mt-2 h-4 w-56" />
          </div>
        ))}
      </div>
    );
  }

  const created = new Date(workspace.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="grid gap-4 px-8 py-6 sm:grid-cols-2">
      <div className="rounded-lg border border-hairline bg-canvas p-5 shadow-level-2">
        <p className="text-xs font-medium uppercase tracking-wide text-mute">
          Repository
        </p>
        <div className="mt-3 flex items-center gap-2">
          <Image
            src="/logo-github-light.svg"
            alt="GitHub"
            width={16}
            height={16}
            className="size-4 shrink-0"
          />
          <p className="truncate font-mono text-sm text-ink">
            {workspace.repo_full_name ||
              `${workspace.repo_owner}/${workspace.repo_name}`}
          </p>
          {workspace.repo_private && (
            <Lock className="size-3.5 shrink-0 text-mute" />
          )}
        </div>
      </div>

      <div className="rounded-lg border border-hairline bg-canvas p-5 shadow-level-2">
        <p className="text-xs font-medium uppercase tracking-wide text-mute">
          Details
        </p>
        <div className="mt-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-body">Status</span>
            <StatusBadge status={workspace.status} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-body">Created</span>
            <span className="font-mono text-sm tabular-nums text-ink">
              {created}
            </span>
          </div>
          <div className="flex items-start justify-between gap-3">
            <span className="text-sm text-body">Last commit</span>
            <span className="flex min-w-0 flex-col items-end gap-0.5 text-right">
              <span className="line-clamp-1 text-sm text-ink">
                {workspace.last_commit_message || "No commits yet"}
              </span>
              <span className="text-xs text-mute">
                {timeAgo(workspace.last_commit_at || workspace.created_at)}
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
