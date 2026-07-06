"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Lock, Search, Check, Loader2 } from "lucide-react";
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
  const [search, setSearch] = useState("");
  const [repoLoading, setRepoLoading] = useState(false);

  // Fetch repos for the selected installation.
  const fetchRepos = async (installationID: string) => {
    const existing = installations.find((i) => i.id === installationID);
    if (existing?.repos?.length) return;

    setRepoLoading(true);
    try {
      const data = await api.get<{ repos: Repo[] }>(
        `/api/v1/github/installations/${installationID}`
      );
      setInstallations((prev) =>
        prev.map((inst) =>
          inst.id === installationID
            ? { ...inst, repos: data.repos || [] }
            : inst
        )
      );
    } catch {
      // ignore
    } finally {
      setRepoLoading(false);
    }
  };

  useEffect(() => {
    api
      .get<Installation[]>("/api/v1/github/installations")
      .then((data) => {
        const list = data || [];
        setInstallations(list);
        if (list.length > 0) {
          const first = list[0].id;
          setSelectedInstallationID(first);
          // Fetch repos for first installation.
          setTimeout(() => fetchRepos(first), 0);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedInstallation = installations.find(
    (i) => i.id === selectedInstallationID
  );
  const repos = useMemo(() => selectedInstallation?.repos || [], [selectedInstallation?.repos]);

  const filteredRepos = useMemo(() => {
    if (!search.trim()) return repos;
    const q = search.toLowerCase();
    return repos.filter(
      (r) =>
        r.full_name.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        r.owner.toLowerCase().includes(q)
    );
  }, [repos, search]);

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
      const msg =
        err instanceof Error ? err.message : "Failed to create workspace.";
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

  return (
    <div className="p-8">
      <button
        onClick={() => router.push("/console/workspaces")}
        className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-950 mb-6 transition-colors"
      >
        <ChevronLeft className="size-4" />
        All Workspaces
      </button>

      <h1 className="text-2xl font-bold text-zinc-950 mb-2">
        Create a Workspace
      </h1>
      <p className="text-sm text-zinc-500 mb-8">
        Import a Git repository and configure your agent team.
      </p>

      {installations.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-12 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-zinc-100 mx-auto mb-4">
            <Search className="size-6 text-zinc-400" />
          </div>
          <p className="text-sm font-semibold text-zinc-950 mb-1">
            No GitHub installations
          </p>
          <p className="text-sm text-zinc-500 mb-6">
            Install the GitSquad GitHub App to connect your repositories.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          {/* Account tabs */}
          {installations.length > 1 && (
            <div className="flex gap-2 mb-6">
              {installations.map((inst) => (
                <button
                  key={inst.id}
                  type="button"
                  onClick={() => {
                    setSelectedInstallationID(inst.id);
                    setSelectedRepoID("");
                    fetchRepos(inst.id);
                  }}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    selectedInstallationID === inst.id
                      ? "bg-zinc-950 text-white"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                  }`}
                >
                  {inst.account_login}
                </button>
              ))}
            </div>
          )}

          {/* Repo search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search repositories..."
              className="w-full rounded-lg border border-zinc-200 bg-white pl-9 pr-3 py-2.5 text-sm text-zinc-950 placeholder:text-zinc-400 focus:border-zinc-950 focus:outline-none transition-colors"
            />
          </div>

          {/* Repo cards */}
          {repoLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-6 text-zinc-400 animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8 max-h-96 overflow-y-auto">
              {filteredRepos.map((repo) => {
                const isSelected = selectedRepoID === repo.id;
                return (
                  <button
                    key={repo.id}
                    type="button"
                    onClick={() => setSelectedRepoID(repo.id)}
                    className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-all ${
                      isSelected
                        ? "border-zinc-950 bg-zinc-50 ring-1 ring-zinc-950"
                        : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50"
                    }`}
                  >
                    <div
                      className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                        isSelected
                          ? "border-zinc-950 bg-zinc-950"
                          : "border-zinc-300"
                      }`}
                    >
                      {isSelected && (
                        <Check className="size-3 text-white" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold text-zinc-950 truncate">
                          {repo.name}
                        </p>
                        {repo.private && (
                          <Lock className="size-3 text-zinc-400 shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-zinc-400 truncate">
                        {repo.owner}
                      </p>
                    </div>
                  </button>
                );
              })}
              {filteredRepos.length === 0 && !repoLoading && (
                <div className="col-span-2 py-12 text-center">
                  <p className="text-sm text-zinc-400">
                    {search
                      ? "No repositories match your search."
                      : "No repositories found."}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Name + Create */}
          {selectedRepoID && (
            <div className="rounded-xl border border-zinc-200 bg-white p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-zinc-950 mb-1.5">
                  Workspace Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. main, frontend, backend"
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-950 placeholder:text-zinc-400 focus:border-zinc-950 focus:outline-none transition-colors"
                  required
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={creating}
                className="w-full rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 transition-colors"
              >
                {creating ? "Creating..." : "Create Workspace"}
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
