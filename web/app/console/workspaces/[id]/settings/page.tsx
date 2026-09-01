"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, Trash2 } from "lucide-react";
import { api, Workspace } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function WorkspaceSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmText, setConfirmText] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api
      .get<Workspace>(`/api/v1/workspaces/${id}`)
      .then(setWorkspace)
      .catch(() => router.push("/console/workspaces"))
      .finally(() => setLoading(false));
  }, [id, router]);

  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/console/workspaces/${id}`
      : "";

  const handleDelete = async () => {
    if (confirmText !== workspace?.name || deleting) return;
    setDeleting(true);
    try {
      await api.delete(`/api/v1/workspaces/${id}/delete`);
      router.push("/console/workspaces");
    } catch {
      setDeleting(false);
    }
  };

  if (loading || !workspace) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-8 pb-4 pt-6">
        <button
          onClick={() => router.push(`/console/workspaces/${id}`)}
          className="flex items-center gap-1 text-sm text-body transition-colors hover:text-ink"
        >
          <ChevronLeft className="size-4" />
          Back
        </button>
      </div>

      <div className="mx-auto w-full max-w-2xl flex-1 px-8 pb-8">
        <h1 className="mb-6 text-lg font-semibold text-ink">Settings</h1>

        {/* General */}
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium text-ink">General</h2>
          <div className="space-y-4 rounded-lg border border-hairline bg-canvas p-5 shadow-level-2">
            <div>
              <label className="mb-1.5 block text-xs text-mute">Workspace Name</label>
              <div className="text-sm text-ink">{workspace.name}</div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-mute">URL</label>
              <div className="truncate font-mono text-xs text-body">{url}</div>
            </div>
          </div>
        </section>

        {/* Avatar */}
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium text-ink">Avatar</h2>
          <div className="flex items-center gap-4 rounded-lg border border-hairline bg-canvas p-5 shadow-level-2">
            <div className="flex size-14 items-center justify-center rounded-sm bg-primary text-xl font-semibold text-white">
              {workspace.name.slice(0, 2).toUpperCase()}
            </div>
            <p className="text-xs text-mute">Workspace avatar</p>
          </div>
        </section>

        {/* Danger zone */}
        <section>
          <h2 className="mb-3 text-sm font-medium text-destructive">Danger Zone</h2>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-hairline bg-canvas p-5 shadow-level-2">
            <div>
              <p className="text-sm font-medium text-ink">Delete Project</p>
              <p className="mt-0.5 text-xs text-mute">
                Deleting a workspace cannot be undone.
              </p>
            </div>
            <Dialog
              open={deleteOpen}
              onOpenChange={(v) => {
                setDeleteOpen(v);
                if (!v) setConfirmText("");
              }}
            >
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="shrink-0 border-destructive text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="size-4" />
                  Delete Project
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Delete workspace</DialogTitle>
                  <DialogDescription>
                    Deleting this workspace cannot be undone. This will permanently
                    remove the workspace and all of its issues.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  <p className="text-sm text-body">
                    To confirm, type{" "}
                    <span className="font-mono font-medium text-ink">
                      {workspace.name}
                    </span>{" "}
                    below.
                  </p>
                  <Input
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder={workspace.name}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setDeleteOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={confirmText !== workspace.name || deleting}
                    onClick={handleDelete}
                  >
                    {deleting ? "Deleting…" : "Delete"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </section>
      </div>
    </div>
  );
}
