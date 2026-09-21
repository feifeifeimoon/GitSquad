"use client";

import { api } from "@/lib/api";
import { useApi } from "@/lib/query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface User {
  id: string;
  login: string;
  avatar_url: string;
}

// UserSettings renders the user-level settings sections (Profile + Daemon
// Tokens). It is shared by the global /settings page and the workspace
// /{slug}/settings page, where it appears above the workspace sections.
export function UserSettings() {
  // Same key as the shell, so the settings page and the sidebar avatar share
  // one read of the signed-in identity.
  const { data: user } = useApi<User>("/api/v1/me", () =>
    api.get<User>("/api/v1/me"),
  );

  return (
    <>
      {/* Profile */}
      <section className="mb-8">
        <h2 className="mb-3 text-label font-semibold text-ink">Profile</h2>
        <div className="flex items-center gap-4 rounded-lg border border-hairline bg-canvas p-5 shadow-level-2">
          <Avatar className="size-14">
            <AvatarImage src={user?.avatar_url} />
            <AvatarFallback>{user?.login?.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-copy font-semibold text-ink">@{user?.login}</p>
            <p className="text-caption text-mute">Connected via Google</p>
          </div>
        </div>
      </section>

      {/* Daemon Tokens */}
      <section className="mb-8">
        <h2 className="mb-3 text-label font-semibold text-ink">Daemon Tokens</h2>
        <div className="rounded-lg border border-hairline bg-canvas p-5 shadow-level-2">
          <p className="text-copy text-body">
            Generate daemon tokens for headless / SSH / CI environments.
          </p>
          <p className="mt-2 text-caption text-mute">
            Token management will be available in the next update.
          </p>
        </div>
      </section>
    </>
  );
}
