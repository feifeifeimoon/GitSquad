"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Lock, Search, Check, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

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
      <div className="flex h-full items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-8">
      <button
        onClick={() => router.push("/console/workspaces")}
        className="mb-6 flex items-center gap-1 text-sm text-body transition-colors hover:text-ink"
      >
        <ChevronLeft className="size-4" />
        All Workspaces
      </button>

      <h1 className="mb-2 text-2xl font-semibold tracking-[-0.04em] text-ink">
        Create a Workspace
      </h1>
      <p className="mb-8 text-sm text-body">
        Import a Git repository and configure your agent team.
      </p>

      {installations.length === 0 ? (
        <div className="rounded-md border border-hairline bg-canvas p-12 text-center shadow-level-2">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
            <Search className="size-6 text-mute" />
          </div>
          <p className="mb-1 text-sm font-semibold text-ink">
            No GitHub installations
          </p>
          <p className="text-sm text-body">
            Install the GitSquad GitHub App to connect your repositories.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          {/* Account tabs */}
          {installations.length > 1 && (
            <div className="mb-6 flex gap-2">
              {installations.map((inst) => (
                <button
                  key={inst.id}
                  type="button"
                  onClick={() => {
                    setSelectedInstallationID(inst.id);
                    setSelectedRepoID("");
                    fetchRepos(inst.id);
                  }}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    selectedInstallationID === inst.id
                      ? "bg-primary text-white"
                      : "bg-muted text-body hover:bg-canvas-soft-2 hover:text-ink"
                  }`}
                >
                  {inst.account_login}
                </button>
              ))}
            </div>
          )}

          {/* Repo search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mute" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search repositories..."
              className="h-10 w-full rounded-sm border border-hairline bg-canvas pl-9 pr-3 text-sm text-ink transition-colors placeholder:text-mute focus:border-hairline-strong focus:outline-none"
            />
          </div>

          {/* Repo cards */}
          {repoLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-6 animate-spin text-mute" />
            </div>
          ) : (
            <div className="mb-8 grid max-h-96 grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
              {filteredRepos.map((repo) => {
                const isSelected = selectedRepoID === repo.id;
                return (
                  <button
                    key={repo.id}
                    type="button"
                    onClick={() => setSelectedRepoID(repo.id)}
                    className={`flex items-center gap-3 rounded-md border p-4 text-left transition-all ${
                      isSelected
                        ? "border-primary bg-muted ring-1 ring-primary"
                        : "border-hairline bg-canvas hover:bg-muted"
                    }`}
                  >
                    <div
                      className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                        isSelected
                          ? "border-primary bg-primary"
                          : "border-hairline-strong"
                      }`}
                    >
                      {isSelected && (
                        <Check className="size-3 text-white" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-sm font-semibold text-ink">
                          {repo.name}
                        </p>
                        {repo.private && (
                          <Lock className="size-3 shrink-0 text-mute" />
                        )}
                      </div>
                      <p className="truncate text-xs text-mute">
                        {repo.owner}
                      </p>
                    </div>
                  </button>
                );
              })}
              {filteredRepos.length === 0 && !repoLoading && (
                <div className="col-span-2 py-12 text-center">
                  <p className="text-sm text-mute">
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
            <div className="space-y-4 rounded-md border border-hairline bg-canvas p-5 shadow-level-2">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-ink">
                  Workspace Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. main, frontend, backend"
                  className="h-10 w-full rounded-sm border border-hairline bg-canvas px-3 text-sm text-ink transition-colors placeholder:text-mute focus:border-hairline-strong focus:outline-none"
                  required
                />
              </div>

              {error && (
                <p className="rounded-sm bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}

              <Button type="submit" disabled={creating} className="w-full">
                {creating ? "Creating..." : "Create Workspace"}
              </Button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
