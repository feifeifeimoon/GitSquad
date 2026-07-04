"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderGit2, Plus, Archive } from "lucide-react";
import { api } from "@/lib/api";

interface Workspace {
  id: string;
  name: string;
  status: string;
  created_at: string;
  updated_at: string;
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
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <FolderGit2 className="size-5 text-zinc-950" />
          <h1 className="text-xl font-bold text-zinc-950">Workspaces</h1>
        </div>
        <button
          onClick={() => router.push("/console/workspaces/new")}
          className="inline-flex items-center gap-2 rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 transition-colors"
        >
          <Plus className="size-4" />
          New Workspace
        </button>
      </div>

      {workspaces.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-12 text-center">
          <p className="text-sm font-medium text-zinc-500 mb-1">No workspaces yet</p>
          <p className="text-xs text-zinc-400 mb-4">
            Install the GitHub App and create your first workspace.
          </p>
          <button
            onClick={() => router.push("/console/workspaces/new")}
            className="inline-flex items-center gap-2 rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 transition-colors"
          >
            <Plus className="size-4" />
            Create Workspace
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {workspaces.map((w) => (
            <div
              key={w.id}
              onClick={() => router.push(`/console/workspaces/${w.id}`)}
              className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-4 hover:border-zinc-400 cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="flex size-8 items-center justify-center rounded-md bg-zinc-100">
                  <FolderGit2 className="size-4 text-zinc-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-950">{w.name}</p>
                  <p className="text-xs text-zinc-400">
                    {w.status === "active" ? "Active" : w.status} · Created{" "}
                    {new Date(w.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleArchive(w.id);
                }}
                className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-950 transition-colors"
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
