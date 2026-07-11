"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function ConfigureContent() {
  const router = useRouter();
  const params = useSearchParams();

  const installationID = params.get("installation") || "";
  const repoID = params.get("repo") || "";
  const repoOwner = params.get("owner") || "";
  const repoName = params.get("name") || "";
  const repoPrivate = params.get("private") === "1";

  const [name, setName] = useState(repoName);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  // Missing required params — bounce back to repo selection.
  if (!installationID || !repoID) {
    if (typeof window !== "undefined") {
      router.replace("/console/workspaces/new");
    }
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Workspace name is required.");
      return;
    }

    setCreating(true);
    try {
      await api.post("/api/v1/workspaces", {
        installation_id: installationID,
        repo_id: repoID,
        name: name.trim(),
      });
      router.push("/console/workspaces");
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to create workspace."
      );
    }
    setCreating(false);
  };

  return (
    <div className="mx-auto max-w-xl p-8">
      <button
        onClick={() => router.push("/console/workspaces/new")}
        className="mb-6 flex items-center gap-1 text-sm text-body transition-colors hover:text-ink"
      >
        <ChevronLeft className="size-4" />
        Back to repositories
      </button>

      <h1 className="mb-2 text-2xl font-semibold tracking-[-0.04em] text-ink">
        Configure Workspace
      </h1>
      <p className="mb-8 text-sm text-body">
        Name your workspace and start importing{" "}
        <span className="font-medium text-ink">
          {repoOwner}/{repoName}
        </span>
        .
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Repo summary (read-only) */}
        <div className="flex items-center gap-3 rounded-md border border-hairline bg-canvas p-4 shadow-level-2">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-muted">
            <GitHubIcon className="size-4 text-body" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">
              {repoOwner}/{repoName}
            </p>
            <p className="text-xs text-mute">
              {repoPrivate ? "Private" : "Public"} repository
            </p>
          </div>
          <Badge variant="secondary" className="ml-auto shrink-0">
            {repoPrivate ? "Private" : "Public"}
          </Badge>
        </div>

        {/* Workspace name */}
        <div className="space-y-4 rounded-md border border-hairline bg-canvas p-5 shadow-level-2">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink">
              Workspace Name
            </label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. main, frontend, backend"
              required
              autoFocus
            />
            <p className="mt-1.5 text-xs text-mute">
              Defaults to the repository name.
            </p>
          </div>

          {error && (
            <p className="rounded-sm bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" disabled={creating} className="w-full">
            {creating ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Workspace"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function ConfigureWorkspacePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <Loader2 className="size-6 animate-spin text-mute" />
        </div>
      }
    >
      <ConfigureContent />
    </Suspense>
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
