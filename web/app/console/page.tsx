"use client";

import { LayoutDashboard } from "lucide-react";

export default function ConsoleHome() {
  return (
    <div className="p-6">
      <div className="flex items-center gap-2 mb-6">
        <LayoutDashboard className="size-5 text-zinc-950" />
        <h1 className="text-xl font-bold text-zinc-950">Home</h1>
      </div>

      <div className="rounded-lg border border-dashed border-zinc-300 p-12 text-center">
        <p className="text-sm font-medium text-zinc-500 mb-1">Workspaces coming soon</p>
        <p className="text-xs text-zinc-400">
          Link a GitHub repository to create your first workspace.
        </p>
      </div>
    </div>
  );
}
