"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { FolderGit2, ChevronLeft, ExternalLink } from "lucide-react";
import { api } from "@/lib/api";

interface Workspace {
  id: string;
  name: string;
  status: string;
  user_id: string;
  installation_id: string;
  github_repo_id: string;
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
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-6 h-6 border-2 border-zinc-950 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!workspace) return null;

  const isDegraded = workspace.status === "degraded";

  return (
    <div className="p-6 max-w-3xl">
      <button
        onClick={() => router.push("/console/workspaces")}
        className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-950 mb-4 transition-colors"
      >
        <ChevronLeft className="size-4" />
        Back to Workspaces
      </button>

      <div className="flex items-center gap-3 mb-6">
        <div className="flex size-10 items-center justify-center rounded-lg bg-zinc-100">
          <FolderGit2 className="size-5 text-zinc-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-zinc-950">{workspace.name}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                workspace.status === "active"
                  ? "bg-green-100 text-green-700"
                  : workspace.status === "degraded"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-zinc-100 text-zinc-500"
              }`}
            >
              {workspace.status}
            </span>
            {isDegraded && (
              <span className="text-xs text-amber-600">
                Repository access may have changed. Re-link the GitHub App to restore.
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-zinc-400 text-xs mb-0.5">Created</p>
            <p className="text-zinc-950 font-medium">
              {new Date(workspace.created_at).toLocaleDateString()}
            </p>
          </div>
          <div>
            <p className="text-zinc-400 text-xs mb-0.5">Status</p>
            <p className="text-zinc-950 font-medium capitalize">
              {workspace.status}
            </p>
          </div>
        </div>

        <div className="rounded-md border border-dashed border-zinc-300 p-6 text-center">
          <ExternalLink className="size-5 text-zinc-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-zinc-500 mb-1">
            Issues & agent configuration coming soon
          </p>
          <p className="text-xs text-zinc-400">
            This is where the Issue blackboard and agent team will live (Task 4 & 5).
          </p>
        </div>
      </div>
    </div>
  );
}
