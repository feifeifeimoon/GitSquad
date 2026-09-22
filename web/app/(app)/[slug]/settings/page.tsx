"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { api, Workspace } from "@/lib/api";
import { setApiData, useApi } from "@/lib/query";
import { paths } from "@/lib/paths";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WorkspaceAvatar } from "@/components/workspace-avatar";
import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/error-state";
import {
  SettingRow,
  SettingSection,
} from "@/components/settings/settings-layout";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * The workspace's own settings.
 *
 * It no longer opens with the account's Profile and Daemon Tokens. Those are
 * account-scoped, they belong on `/settings`, and rendering them here made this
 * page two scopes in one scroll with the wrong one first — the page you reach
 * from "Workspace settings" led with someone else's settings.
 */
export default function WorkspaceSettingsPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const [confirmText, setConfirmText] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    data: workspace,
    error,
    refresh,
  } = useApi<Workspace>(`/api/v1/workspaces/${slug}`, () =>
    api.get<Workspace>(`/api/v1/workspaces/${slug}`),
  );

  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/${slug}`
      : "";

  const updateAvatar = async (avatarUrl: string) => {
    setUploading(true);
    setAvatarError("");
    try {
      await api.put(`/api/v1/workspaces/${slug}/avatar`, { avatar_url: avatarUrl });
      setApiData<Workspace | undefined>(`/api/v1/workspaces/${slug}`, (prev) =>
        prev ? { ...prev, avatar_url: avatarUrl } : prev,
      );
    } catch {
      setAvatarError("Failed to update avatar.");
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setAvatarError("Image must be under 1MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      updateAvatar(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAvatar = () => updateAvatar("");

  const handleDelete = async () => {
    if (confirmText !== workspace?.name || deleting) return;
    setDeleting(true);
    try {
      await api.delete(`/api/v1/workspaces/${slug}/delete`);
      router.push(paths.workspaces());
    } catch {
      setDeleting(false);
    }
  };

  if (error) {
    return (
      <div className="p-8">
        <ErrorState
          what="workspace"
          error={error}
          onRetry={refresh}
          notFoundHref={paths.workspaces()}
          notFoundLabel="Go to workspaces"
        />
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Workspace settings" />

      <div className="mx-auto w-full max-w-2xl flex-1 px-8 pb-8 pt-6">
        <SettingSection title="General">
          <SettingRow label="Name">
            <span className="text-copy text-ink">{workspace.name}</span>
          </SettingRow>
          <SettingRow
            label="URL"
            description="Where this workspace lives in the console."
          >
            <span className="truncate font-mono text-caption text-body">
              {url}
            </span>
          </SettingRow>
          <SettingRow
            label="Repository"
            description="The GitHub repository its agents work in."
          >
            <span className="truncate font-mono text-caption text-body">
              {workspace.repo_full_name ||
                `${workspace.repo_owner}/${workspace.repo_name}`}
            </span>
          </SettingRow>
        </SettingSection>

        <SettingSection title="Avatar">
          <SettingRow
            leading={
              <WorkspaceAvatar
                name={workspace.name}
                avatarUrl={workspace.avatar_url}
                className="size-10"
              />
            }
            label={workspace.name}
            description={avatarError || "PNG, JPG or SVG, up to 1MB"}
            align="center"
          >
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? "Uploading…" : "Upload"}
              </Button>
              {workspace.avatar_url && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={uploading}
                  onClick={handleRemoveAvatar}
                >
                  Remove
                </Button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </SettingRow>
        </SettingSection>

        <SettingSection
          title="Danger Zone"
          tone="destructive"
          description="These cannot be undone."
        >
          <SettingRow
            label={<span className="text-destructive">Delete workspace</span>}
            description="Permanently remove this workspace and every issue, agent and skill in it."
          >
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
                  Delete
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
                  <p className="text-copy text-body">
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
          </SettingRow>
        </SettingSection>
      </div>
    </div>
  );
}
