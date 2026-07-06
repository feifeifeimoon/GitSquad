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
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-6 h-6 border-2 border-zinc-950 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!workspace) return null;

  const repoFullName = workspace.repo_full_name || `${workspace.repo_owner}/${workspace.repo_name}`;

  return (
    <div className="p-8">
      <button
        onClick={() => router.push("/console/workspaces")}
        className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-950 mb-6 transition-colors"
      >
        <ChevronLeft className="size-4" />
        All Workspaces
      </button>

      {/* Header */}
      <div className="flex items-start gap-4 mb-8">
        <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-zinc-950 text-white text-lg font-bold">
          {workspace.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-zinc-950">{workspace.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                workspace.status === "active"
                  ? "bg-green-100 text-green-700"
                  : workspace.status === "degraded"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-zinc-100 text-zinc-500"
              }`}
            >
              {workspace.status}
            </span>
          </div>
        </div>
      </div>

      {/* Repo card */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5 mb-6">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-zinc-100">
            {workspace.repo_private ? (
              <Lock className="size-4 text-zinc-500" />
            ) : (
              <ExternalLink className="size-4 text-zinc-500" />
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-950">{repoFullName}</p>
            <p className="text-xs text-zinc-400">
              {workspace.repo_private ? "Private" : "Public"} repository
            </p>
          </div>
        </div>
      </div>

      {/* Metadata */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-950 mb-3">Details</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-zinc-400 mb-0.5">Created</p>
            <div className="flex items-center gap-1.5">
              <Calendar className="size-3.5 text-zinc-400" />
              <p className="text-zinc-700">
                {new Date(workspace.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>
          <div>
            <p className="text-xs text-zinc-400 mb-0.5">Repository</p>
            <p className="text-zinc-700 truncate">{repoFullName}</p>
          </div>
        </div>
      </div>

      {/* Placeholder for future features */}
      <div className="mt-6 rounded-xl border border-dashed border-zinc-300 p-10 text-center">
        <p className="text-sm font-medium text-zinc-500 mb-1">
          Issues & agent configuration
        </p>
        <p className="text-xs text-zinc-400">
          Issue blackboard and agent team management coming in upcoming sprints.
        </p>
      </div>
    </div>
  );
}
