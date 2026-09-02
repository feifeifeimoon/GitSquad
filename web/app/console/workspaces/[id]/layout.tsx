"use client";

import { use, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ChevronLeft, Lock } from "lucide-react";
import { api, Workspace } from "@/lib/api";
import { StatusBadge } from "@/components/ui/status-badge";
import { WorkspaceAvatar } from "@/components/workspace-avatar";
import { Skeleton } from "@/components/ui/skeleton";

export default function WorkspaceDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const pathname = usePathname();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);

  useEffect(() => {
    api
      .get<Workspace>(`/api/v1/workspaces/${id}`)
      .then(setWorkspace)
      .catch(() => {});
  }, [id]);

  const tabs = [
    { href: `/console/workspaces/${id}`, label: "Overview" },
    { href: `/console/workspaces/${id}/issues`, label: "Issues" },
  ];

  const isActive = (href: string) =>
    href === `/console/workspaces/${id}`
      ? pathname === href
      : pathname?.startsWith(href);

  const created = workspace
    ? new Date(workspace.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-hairline px-8 pb-3 pt-6">
        <button
          onClick={() => router.push("/console/workspaces")}
          className="mb-3 flex items-center gap-1 text-sm text-body transition-colors hover:text-ink"
        >
          <ChevronLeft className="size-4" />
          All workspaces
        </button>

        <div className="flex items-center gap-3">
          {workspace ? (
            <WorkspaceAvatar
              name={workspace.name}
              avatarUrl={workspace.avatar_url}
              className="size-8"
            />
          ) : (
            <Skeleton className="size-8 rounded-lg" />
          )}
          <h1 className="text-xl font-semibold tracking-tight text-ink">
            {workspace?.name ?? "Workspace"}
          </h1>
          {workspace && <StatusBadge status={workspace.status} />}
        </div>

        {workspace && (
          <p className="mt-1 flex items-center gap-1.5 font-mono text-xs text-mute">
            {workspace.repo_full_name ||
              `${workspace.repo_owner}/${workspace.repo_name}`}
            {workspace.repo_private && <Lock className="size-3 shrink-0" />}
            <span className="text-mute/50">·</span>
            <span>Created {created}</span>
          </p>
        )}

        <nav className="mt-4 flex items-center gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.href}
              onClick={() => router.push(tab.href)}
              className={`rounded-sm px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive(tab.href)
                  ? "bg-muted text-ink"
                  : "text-body hover:bg-muted hover:text-ink"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
