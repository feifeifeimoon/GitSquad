"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ExternalLink, Lock, Calendar } from "lucide-react";
import { api } from "@/lib/api";

interface Workspace {
  id: string;
  name: string;
  status: string;
  repo_full_name: string;
  repo_owner: string;
  repo_name: string;
  repo_private: boolean;
  created_at: string;
  updated_at: string;
}

export default function WorkspaceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
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

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!workspace) return null;

  const repoFullName = workspace.repo_full_name || `${workspace.repo_owner}/${workspace.repo_name}`;

  return (
    <div className="p-8">
      <button
        onClick={() => router.push("/console/workspaces")}
        className="mb-6 flex items-center gap-1 text-sm text-body transition-colors hover:text-ink"
      >
        <ChevronLeft className="size-4" />
        All Workspaces
      </button>

      {/* Header */}
      <div className="mb-8 flex items-start gap-4">
        <div className="flex size-14 shrink-0 items-center justify-center rounded-md bg-primary text-lg font-bold text-white">
          {workspace.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-[-0.04em] text-ink">{workspace.name}</h1>
          <div className="mt-1 flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                workspace.status === "active"
                  ? "bg-[#0070f3]/15 text-[#0070f3]"
                  : workspace.status === "degraded"
                  ? "bg-warning/15 text-warning"
                  : "bg-muted text-mute"
              }`}
            >
              {workspace.status}
            </span>
          </div>
        </div>
      </div>

      {/* Repo card */}
      <div className="mb-6 rounded-md border border-hairline bg-canvas p-5 shadow-level-2">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-sm bg-muted">
            {workspace.repo_private ? (
              <Lock className="size-4 text-body" />
            ) : (
              <ExternalLink className="size-4 text-body" />
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">{repoFullName}</p>
            <p className="text-xs text-mute">
              {workspace.repo_private ? "Private" : "Public"} repository
            </p>
          </div>
        </div>
      </div>

      {/* Metadata */}
      <div className="rounded-md border border-hairline bg-canvas p-5 shadow-level-2">
        <h2 className="mb-3 text-sm font-semibold text-ink">Details</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="mb-0.5 text-xs text-mute">Created</p>
            <div className="flex items-center gap-1.5">
              <Calendar className="size-3.5 text-mute" />
              <p className="text-body">
                {new Date(workspace.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>
          <div>
            <p className="mb-0.5 text-xs text-mute">Repository</p>
            <p className="truncate text-body">{repoFullName}</p>
          </div>
        </div>
      </div>

      {/* Placeholder for future features */}
      <div className="mt-6 rounded-md border border-dashed border-hairline-strong p-10 text-center">
        <p className="mb-1 text-sm font-medium text-body">
          Issues & agent configuration
        </p>
        <p className="text-xs text-mute">
          Issue blackboard and agent team management coming in upcoming sprints.
        </p>
      </div>
    </div>
  );
}
