"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Search,
  Check,
  Loader2,
  Lock,
  ArrowRight,
} from "lucide-react";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
  const [search, setSearch] = useState("");
  const [repoLoading, setRepoLoading] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [installLoading, setInstallLoading] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  // Start the GitHub App installation flow: get a state-tagged install URL
  // from the backend, then bounce the user to github.com to authorize.
  const handleInstallApp = async () => {
    setInstallLoading(true);
    try {
      const { url } = await api.post<{ url: string }>(
        "/api/v1/github/prepare-install"
      );
      window.location.href = url;
    } catch {
      setInstallLoading(false);
    }
  };

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
          setTimeout(() => fetchRepos(first), 0);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close account menu on outside click.
  useEffect(() => {
    if (!accountMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [accountMenuOpen]);

  const selectedInstallation = installations.find(
    (i) => i.id === selectedInstallationID
  );
  const repos = useMemo(
    () => selectedInstallation?.repos || [],
    [selectedInstallation?.repos]
  );

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

  const handleSelectAccount = (inst: Installation) => {
    setSelectedInstallationID(inst.id);
    setSelectedRepoID("");
    setAccountMenuOpen(false);
    fetchRepos(inst.id);
  };

  const handleImport = (repo: Repo) => {
    const params = new URLSearchParams({
      installation: selectedInstallationID,
      repo: repo.id,
      owner: repo.owner,
      name: repo.name,
      private: repo.private ? "1" : "0",
    });
    router.push(`/console/workspaces/new/configure?${params.toString()}`);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
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
          <Button
            type="button"
            onClick={handleInstallApp}
            disabled={installLoading}
            className="mt-6"
          >
            {installLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <GitHubIcon className="size-4" />
            )}
            Install GitSquad GitHub App
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Account selector + repository search — same row */}
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            {/* GitHub account dropdown */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-mute">
                GitHub Account
              </label>
              <div className="relative" ref={accountRef}>
                <button
                  type="button"
                  onClick={() => setAccountMenuOpen((v) => !v)}
                  className="flex h-10 w-full items-center justify-between rounded-sm border border-hairline bg-canvas px-3 text-sm text-ink transition-colors hover:bg-muted focus-visible:border-hairline-strong focus-visible:outline-none"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <GitHubIcon className="size-4 shrink-0 text-ink" />
                    <span className="truncate font-medium">
                      {selectedInstallation?.account_login || "Select account"}
                    </span>
                  </span>
                  {accountMenuOpen ? (
                    <ChevronUp className="size-4 shrink-0 text-mute" />
                  ) : (
                    <ChevronDown className="size-4 shrink-0 text-mute" />
                  )}
                </button>

                {accountMenuOpen && (
                  <div className="absolute left-0 right-0 top-11 z-20 overflow-hidden rounded-md border border-hairline bg-canvas py-1 shadow-level-4">
                    {installations.map((inst) => {
                      const isActive = selectedInstallationID === inst.id;
                      return (
                        <button
                          key={inst.id}
                          type="button"
                          onClick={() => handleSelectAccount(inst)}
                          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                            isActive
                              ? "bg-muted text-ink"
                              : "text-body hover:bg-muted hover:text-ink"
                          }`}
                        >
                          <GitHubIcon className="size-4 shrink-0 text-body" />
                          <span className="truncate font-medium">
                            {inst.account_login}
                          </span>
                          <span className="text-xs text-mute">
                            ({inst.account_type})
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Repository search */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-mute">
                Search repositories
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mute" />
                <Input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Find a repository..."
                  className="pl-9"
                />
              </div>
            </div>
          </div>

          {/* Repository list */}
          {repoLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-6 animate-spin text-mute" />
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border border-hairline bg-canvas shadow-level-2">
              <div className="max-h-[28rem] overflow-y-auto">
                {filteredRepos.map((repo) => {
                  const isSelected = selectedRepoID === repo.id;
                  return (
                    <div
                      key={repo.id}
                      onClick={() => setSelectedRepoID(repo.id)}
                      className={`group flex cursor-pointer items-center gap-3 border-b border-hairline px-4 py-3.5 transition-colors last:border-b-0 ${
                        isSelected ? "bg-muted" : "hover:bg-muted/60"
                      }`}
                    >
                      {/* radio selector */}
                      <div
                        className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                          isSelected
                            ? "border-primary bg-primary"
                            : "border-hairline-strong"
                        }`}
                      >
                        {isSelected && <Check className="size-3 text-white" />}
                      </div>

                      {/* icon + identity */}
                      <GitHubIcon className="size-4 shrink-0 text-mute" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm">
                            <span className="text-mute">{repo.owner}/</span>
                            <span className="font-semibold text-ink">
                              {repo.name}
                            </span>
                          </p>
                          <Badge variant="secondary" className="shrink-0">
                            {repo.private ? (
                              <>
                                <Lock className="size-3" />
                                Private
                              </>
                            ) : (
                              "Public"
                            )}
                          </Badge>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-mute">
                          {repo.full_name} ·{" "}
                          {repo.private ? "Private" : "Public"} repository
                        </p>
                      </div>

                      {/* Import → step 2 */}
                      <Button
                        type="button"
                        size="sm"
                        variant={isSelected ? "default" : "secondary"}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleImport(repo);
                        }}
                        className="shrink-0"
                      >
                        Import
                        <ArrowRight className="size-3.5" />
                      </Button>
                    </div>
                  );
                })}
                {filteredRepos.length === 0 && !repoLoading && (
                  <div className="py-12 text-center">
                    <p className="text-sm text-mute">
                      {search
                        ? "No repositories match your search."
                        : "No repositories found."}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 .5C5.73.5.5 5.74.5 12.02c0 5.1 3.29 9.42 7.86 10.95.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.55-3.88-1.55-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.2 1.77 1.2 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.47.11-3.06 0 0 .97-.31 3.18 1.18a11.05 11.05 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.77.12 3.06.74.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.4-5.25 5.69.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56A11.53 11.53 0 0 0 23.5 12.02C23.5 5.74 18.27.5 12 .5Z" />
    </svg>
  );
}
