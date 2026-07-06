"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, GitBranch, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";

export default function ConsoleHome() {
  const router = useRouter();
  const [installing, setInstalling] = useState(false);

  const handleInstall = async () => {
    setInstalling(true);
    try {
      const data = await api.post<{ url: string }>("/api/v1/github/prepare-install");
      window.location.href = data.url;
    } catch {
      // Fallback: direct link without state.
      window.location.href = "https://github.com/apps/gitsquad/installations/new";
    }
    setInstalling(false);
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <LayoutDashboard className="size-5 text-zinc-950" />
        <h1 className="text-xl font-bold text-zinc-950">Home</h1>
      </div>

      {/* Install GitHub App CTA */}
      <div className="rounded-lg border border-zinc-200 bg-white p-6 mb-6">
        <div className="flex items-start gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-zinc-950">
            <GitBranch className="size-5 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-zinc-950 mb-1">Connect GitHub</h2>
            <p className="text-sm text-zinc-500 mb-4">
              Install the GitSquad GitHub App to grant access to your repositories.
              You can choose which repos to share.
            </p>
            <button
              onClick={handleInstall}
              disabled={installing}
              className="inline-flex items-center gap-2 rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 transition-colors"
            >
              {installing ? "Redirecting..." : "Install on GitHub"}
              <ArrowRight className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid gap-4 sm:grid-cols-2">
        <button
          onClick={() => router.push("/console/workspaces/new")}
          className="rounded-lg border border-dashed border-zinc-300 p-6 text-left hover:border-zinc-950 hover:bg-zinc-50 transition-colors"
        >
          <p className="text-sm font-semibold text-zinc-950 mb-1">Create a Workspace</p>
          <p className="text-xs text-zinc-400">
            Bind a repository and configure your agent team.
          </p>
        </button>
        <button
          onClick={() => router.push("/console/workspaces")}
          className="rounded-lg border border-dashed border-zinc-300 p-6 text-left hover:border-zinc-950 hover:bg-zinc-50 transition-colors"
        >
          <p className="text-sm font-semibold text-zinc-950 mb-1">View Workspaces</p>
          <p className="text-xs text-zinc-400">
            Manage your existing workspaces and issues.
          </p>
        </button>
      </div>
    </div>
  );
}
