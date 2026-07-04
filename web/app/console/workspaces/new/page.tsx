"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderGit2, ChevronLeft, GitBranch } from "lucide-react";
import { api } from "@/lib/api";

interface Repo {
  id: string;
  full_name: string;
  owner: string;
  name: string;
  private: boolean;
}

interface Installation {
  id: string;
  account_login: string;
  account_type: string;
  repos: Repo[];
}

export default function NewWorkspacePage() {
  const router = useRouter();
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInstallationID, setSelectedInstallationID] = useState("");
  const [selectedRepoID, setSelectedRepoID] = useState("");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get<Installation[]>("/api/v1/github/installations")
      .then((data) => {
        // The API returns installations without repos by default.
        // Fetch repos for each installation individually.
        const installations = data || [];
        setInstallations(installations);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // When an installation is selected, fetch its repos.
  useEffect(() => {
    if (!selectedInstallationID) return;
    // Repos may already be available from the installations list,
    // but if not, we rely on each installation having repos pre-loaded.
    // The ListInstallations endpoint returns installations WITHOUT repos;
    // repos come from GET /api/v1/github/installations/:id
    // For MVP simplicity, we fetch repos when installation is selected.
    api
      .get<{ repos: Repo[] }>(`/api/v1/github/installations/${selectedInstallationID}`)
      .then((data) => {
        setInstallations((prev) =>
          prev.map((inst) =>
            inst.id === selectedInstallationID
              ? { ...inst, repos: data.repos || [] }
              : inst
          )
        );
      })
      .catch(() => {});
  }, [selectedInstallationID]);

  const selectedInstallation = installations.find(
    (i) => i.id === selectedInstallationID
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!selectedInstallationID || !selectedRepoID || !name.trim()) {
      setError("All fields are required.");
      return;
    }

    setCreating(true);
    try {
      await api.post("/api/v1/workspaces", {
        installation_id: selectedInstallationID,
        repo_id: selectedRepoID,
        name: name.trim(),
      });
      router.push("/console/workspaces");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create workspace.";
      setError(msg);
    }
    setCreating(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-6 h-6 border-2 border-zinc-950 border-t-transparent rounded-full" />
      </div>
    );
  }

  const repos = selectedInstallation?.repos || [];

  return (
    <div className="p-6 max-w-xl">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-950 mb-4 transition-colors"
      >
        <ChevronLeft className="size-4" />
        Back
      </button>

      <div className="flex items-center gap-2 mb-6">
        <FolderGit2 className="size-5 text-zinc-950" />
        <h1 className="text-xl font-bold text-zinc-950">New Workspace</h1>
      </div>

      {installations.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-6 text-center">
          <GitBranch className="size-8 text-zinc-400 mx-auto mb-3" />
          <p className="text-sm font-medium text-zinc-500 mb-1">
            No GitHub installations found
          </p>
          <p className="text-xs text-zinc-400 mb-4">
            Install the GitSquad GitHub App to connect your repositories.
          </p>
          <a
            href="https://github.com/apps/gitsquad/installations/new"
            className="inline-flex items-center gap-2 rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 transition-colors"
          >
            Install on GitHub
          </a>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Installation selector */}
          <div>
            <label className="block text-sm font-medium text-zinc-950 mb-1.5">
              GitHub Account
            </label>
            <select
              value={selectedInstallationID}
              onChange={(e) => {
                setSelectedInstallationID(e.target.value);
                setSelectedRepoID("");
              }}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 focus:border-zinc-950 focus:outline-none"
              required
            >
              <option value="">Select an account...</option>
              {installations.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.account_login} ({inst.account_type})
                </option>
              ))}
            </select>
          </div>

          {/* Repo selector */}
          <div>
            <label className="block text-sm font-medium text-zinc-950 mb-1.5">
              Repository
            </label>
            <select
              value={selectedRepoID}
              onChange={(e) => setSelectedRepoID(e.target.value)}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 focus:border-zinc-950 focus:outline-none disabled:opacity-50"
              disabled={!selectedInstallationID}
              required
            >
              <option value="">
                {selectedInstallationID
                  ? repos.length === 0
                    ? "Loading repositories..."
                    : `Select a repository (${repos.length} available)...`
                  : "Select an account first"}
              </option>
              {repos.map((repo) => (
                <option key={repo.id} value={repo.id}>
                  {repo.full_name} {repo.private ? "(private)" : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Name input */}
          <div>
            <label className="block text-sm font-medium text-zinc-950 mb-1.5">
              Workspace Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. main, frontend, backend"
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 placeholder:text-zinc-400 focus:border-zinc-950 focus:outline-none"
              required
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={creating}
            className="w-full rounded-md bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 transition-colors"
          >
            {creating ? "Creating..." : "Create Workspace"}
          </button>
        </form>
      )}
    </div>
  );
}
