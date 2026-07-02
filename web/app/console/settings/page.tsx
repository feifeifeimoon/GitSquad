"use client";

import { useEffect, useState } from "react";
import { Settings, User, Key } from "lucide-react";
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
    <div className="p-6">
      <div className="flex items-center gap-2 mb-6">
        <Settings className="size-5 text-zinc-950" />
        <h1 className="text-xl font-bold text-zinc-950">Settings</h1>
      </div>

      {/* Profile */}
      <div className="rounded-lg border border-zinc-200 bg-white mb-6">
        <div className="px-5 py-4 border-b border-zinc-100">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-950">
            <User className="size-4" />
            Profile
          </div>
        </div>
        <div className="px-5 py-4 flex items-center gap-4">
          <Avatar className="size-14">
            <AvatarImage src={user?.avatar_url} />
            <AvatarFallback>{user?.login?.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-semibold text-zinc-950">@{user?.login}</p>
            <p className="text-xs text-zinc-400">Connected via Google</p>
          </div>
        </div>
      </div>

      {/* Token management placeholder */}
      <div className="rounded-lg border border-zinc-200 bg-white">
        <div className="px-5 py-4 border-b border-zinc-100">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-950">
            <Key className="size-4" />
            Daemon Tokens
          </div>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-zinc-500">
            Generate daemon tokens for headless / SSH / CI environments.
          </p>
          <p className="text-xs text-zinc-400 mt-2">
            Token management will be available in the next update.
          </p>
        </div>
      </div>
    </div>
  );
}
