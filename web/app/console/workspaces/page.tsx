"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Archive, ExternalLink, Lock } from "lucide-react";
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

  const handleArchive = async (id: string) => {
    try {
      await api.delete(`/api/v1/workspaces/${id}`);
      setWorkspaces((prev) => prev.filter((w) => w.id !== id));
    } catch {
      // ignore
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-6 h-6 border-2 border-zinc-950 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-bold text-zinc-950">Workspaces</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {workspaces.length} workspace{workspaces.length !== 1 && "s"}
          </p>
        </div>
        <button
          onClick={() => router.push("/console/workspaces/new")}
          className="inline-flex items-center gap-2 rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 transition-colors"
        >
          <Plus className="size-4" />
          New Workspace
        </button>
      </div>

      {workspaces.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-zinc-100 mx-auto mb-4">
            <Plus className="size-6 text-zinc-400" />
          </div>
          <p className="text-sm font-semibold text-zinc-950 mb-1">
            No workspaces yet
          </p>
          <p className="text-sm text-zinc-500 mb-6 max-w-xs mx-auto">
            Link a GitHub repository and configure your agent team to get
            started.
          </p>
          <button
            onClick={() => router.push("/console/workspaces/new")}
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 transition-colors"
          >
            Create your first Workspace
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          {workspaces.map((w) => (
            <div
              key={w.id}
              onClick={() => router.push(`/console/workspaces/${w.id}`)}
              className="group flex items-center justify-between rounded-xl border border-zinc-200 bg-white p-5 hover:border-zinc-300 hover:shadow-sm cursor-pointer transition-all"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-zinc-950 text-white text-sm font-bold">
                  {w.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-zinc-950 truncate">
                      {w.name}
                    </p>
                    {w.status !== "active" && (
                      <span className="inline-flex shrink-0 items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                        {w.status}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <ExternalLink className="size-3 text-zinc-400 shrink-0" />
                    <p className="text-[13px] text-zinc-500 truncate">
                      {w.repo_full_name || w.repo_owner + "/" + w.repo_name}
                    </p>
                    {w.repo_private && (
                      <Lock className="size-3 text-zinc-400 shrink-0" />
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleArchive(w.id);
                }}
                className="shrink-0 rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-950 opacity-0 group-hover:opacity-100 transition-all"
                title="Archive workspace"
              >
                <Archive className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
