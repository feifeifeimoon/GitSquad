"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { api, Workspace } from "@/lib/api";
import { StatusBadge } from "@/components/ui/status-badge";

export default function WorkspaceOverviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Workspace>(`/api/v1/workspaces/${id}`)
      .then(setWorkspace)
      .catch(() => router.push("/console/workspaces"))
      .finally(() => setLoading(false));
  }, [id, router]);

  if (loading || !workspace) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const repoFullName =
    workspace.repo_full_name || `${workspace.repo_owner}/${workspace.repo_name}`;

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="rounded-lg border border-hairline bg-canvas p-6 shadow-level-2">
        <h2 className="mb-4 text-sm font-medium text-ink">Overview</h2>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-mute">Repository</dt>
            <dd className="mt-1 flex items-center gap-1.5 font-mono text-sm text-body">
              {repoFullName}
              {workspace.repo_private && <Lock className="size-3 text-mute" />}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-mute">Status</dt>
            <dd className="mt-1">
              <StatusBadge status={workspace.status} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-mute">Created</dt>
            <dd className="mt-1 font-mono text-sm text-body">
              {new Date(workspace.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
