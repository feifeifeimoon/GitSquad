"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Archive, ExternalLink, Lock } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

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
      <div className="flex h-full items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.02em] text-ink">Workspaces</h1>
          <p className="mt-1 text-sm text-body">
            {workspaces.length} workspace{workspaces.length !== 1 && "s"}
          </p>
        </div>
        <Button onClick={() => router.push("/console/workspaces/new")}>
          <Plus className="size-4" />
          New Workspace
        </Button>
      </div>

      {workspaces.length === 0 ? (
        <div className="rounded-md border border-dashed border-hairline-strong p-16 text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
            <Plus className="size-6 text-mute" />
          </div>
          <p className="mb-1 text-sm font-semibold text-ink">
            No workspaces yet
          </p>
          <p className="mx-auto mb-6 max-w-xs text-sm text-body">
            Link a GitHub repository and configure your agent team to get
            started.
          </p>
          <Button onClick={() => router.push("/console/workspaces/new")}>
            Create your first Workspace
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          {workspaces.map((w) => (
            <div
              key={w.id}
              onClick={() => router.push(`/console/workspaces/${w.id}`)}
              className="group flex cursor-pointer items-center justify-between rounded-md border border-hairline bg-canvas p-5 shadow-level-2 transition-all hover:shadow-level-3"
            >
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-primary text-sm font-bold text-white">
                  {w.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-ink">
                      {w.name}
                    </p>
                    {w.status !== "active" && (
                      <span className="inline-flex shrink-0 items-center rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-medium text-warning">
                        {w.status}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <ExternalLink className="size-3 shrink-0 text-mute" />
                    <p className="truncate text-[13px] text-body">
                      {w.repo_full_name || w.repo_owner + "/" + w.repo_name}
                    </p>
                    {w.repo_private && (
                      <Lock className="size-3 shrink-0 text-mute" />
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleArchive(w.id);
                }}
                className="shrink-0 rounded-sm p-2 text-mute opacity-0 transition-all hover:bg-muted hover:text-ink group-hover:opacity-100"
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
