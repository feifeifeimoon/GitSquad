"use client";

import { useEffect, useState } from "react";
import { User, Key } from "lucide-react";
import { api } from "@/lib/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface User {
  id: string;
  login: string;
  avatar_url: string;
}

export default function SettingsPage() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    api.get<User>("/api/v1/me").then(setUser).catch(() => {});
  }, []);

  return (
    <div className="px-8 pt-8 pb-8">
      <div className="mb-6">
        <h1 className="text-sm font-medium text-ink">Settings</h1>
      </div>

      {/* Profile */}
      <div className="mb-6 overflow-hidden rounded-md border border-hairline bg-canvas shadow-level-2">
        <div className="border-b border-hairline px-5 py-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <User className="size-4" />
            Profile
          </div>
        </div>
        <div className="flex items-center gap-4 px-5 py-4">
          <Avatar className="size-14">
            <AvatarImage src={user?.avatar_url} />
            <AvatarFallback>{user?.login?.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-semibold text-ink">@{user?.login}</p>
            <p className="text-xs text-mute">Connected via Google</p>
          </div>
        </div>
      </div>

      {/* Token management placeholder */}
      <div className="overflow-hidden rounded-md border border-hairline bg-canvas shadow-level-2">
        <div className="border-b border-hairline px-5 py-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Key className="size-4" />
            Daemon Tokens
          </div>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-body">
            Generate daemon tokens for headless / SSH / CI environments.
          </p>
          <p className="mt-2 text-xs text-mute">
            Token management will be available in the next update.
          </p>
        </div>
      </div>
    </div>
  );
}
