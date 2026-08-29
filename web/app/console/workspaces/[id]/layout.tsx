"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname, useParams } from "next/navigation";
import { ChevronLeft, Lock } from "lucide-react";
import { api, Workspace } from "@/lib/api";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

export default function WorkspaceDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { id } = useParams<{ id: string }>();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);

  useEffect(() => {
    api
      .get<Workspace>(`/api/v1/workspaces/${id}`)
      .then(setWorkspace)
      .catch(() => router.push("/console/workspaces"));
  }, [id, router]);

  const repoFullName =
    workspace?.repo_full_name ||
    (workspace ? `${workspace.repo_owner}/${workspace.repo_name}` : "");
  const base = `/console/workspaces/${id}`;
  const tabs = [
    { href: base, label: "Overview", active: pathname === base },
    {
      href: `${base}/issues`,
      label: "Issues",
      active: pathname.startsWith(`${base}/issues`),
    },
  ];

  return (
    <div className="flex h-full flex-col">
      <header className="px-8 pb-0 pt-6">
        <button
          onClick={() => router.push("/console/workspaces")}
          className="mb-3 flex items-center gap-1 text-xs text-mute transition-colors hover:text-ink"
        >
          <ChevronLeft className="size-3.5" />
          All workspaces
        </button>

        <div className="flex items-center gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-primary text-sm font-semibold text-white">
            {workspace?.name.slice(0, 2).toUpperCase() ?? ""}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-[-0.02em] text-ink">
              {workspace?.name}
            </h1>
            <p className="mt-0.5 flex items-center gap-1.5 font-mono text-xs text-body">
              <span className="truncate">{repoFullName}</span>
              {workspace?.repo_private && <Lock className="size-3 shrink-0 text-mute" />}
              <span className="text-mute">·</span>
              <span className="shrink-0">
                Created{" "}
                {new Date(workspace?.created_at ?? "").toLocaleDateString(
                  "en-US",
                  { month: "short", day: "numeric", year: "numeric" },
                )}
              </span>
            </p>
          </div>
          <div className="ml-auto shrink-0">
            <StatusBadge status={workspace?.status ?? "active"} />
          </div>
        </div>

        <nav className="mt-4 flex gap-1 border-b border-hairline">
          {tabs.map((t) => (
            <button
              key={t.href}
              onClick={() => router.push(t.href)}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
                t.active
                  ? "border-ink font-medium text-ink"
                  : "border-transparent text-body hover:text-ink",
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  );
}
