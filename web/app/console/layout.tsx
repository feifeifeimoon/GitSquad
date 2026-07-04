"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { LayoutDashboard, Monitor, Settings, LogOut } from "lucide-react";
import { api } from "@/lib/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface User {
  id: string;
  login: string;
  avatar_url: string;
}

const navItems = [
  { href: "/console", label: "Home", icon: LayoutDashboard },
  { href: "/console/daemons", label: "Daemons", icon: Monitor },
  { href: "/console/settings", label: "Settings", icon: Settings },
];

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [logoutConfirm, setLogoutConfirm] = useState(false);

  useEffect(() => {
    api
      .get<User>("/api/v1/me")
      .then(setUser)
      .catch(() => router.push("/login"));
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem("gitsquad_token");
    router.push("/");
  };

  return (
    <div className="flex h-screen bg-white">
      {/* Sidebar */}
      <aside className="flex w-60 flex-col border-r border-zinc-200 bg-zinc-50/50">
        {/* Logo */}
        <div className="flex h-14 items-center gap-2 px-5 border-b border-zinc-200">
          <Image src="/favicon.ico" alt="GitSquad" width={20} height={20} className="size-5" />
          <span className="font-bold text-sm tracking-tight">GitSquad</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-zinc-200/70 text-zinc-950"
                    : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950"
                }`}
              >
                <item.icon className="size-4" />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* User */}
        <div className="border-t border-zinc-200 px-3 py-4">
          <div className="flex items-center gap-3">
            <Avatar className="size-8">
              <AvatarImage src={user?.avatar_url} />
              <AvatarFallback className="text-xs">
                {user?.login?.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-zinc-950 truncate">
                @{user?.login}
              </p>
            </div>
            <button
              onClick={() => setLogoutConfirm(true)}
              className="text-zinc-400 hover:text-zinc-950 transition-colors"
              title="Logout"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 overflow-auto">{children}</div>

      {/* Logout confirmation */}
      {logoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
          <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-lg max-w-xs">
            <p className="text-sm font-semibold text-zinc-950 mb-1">Sign out</p>
            <p className="text-sm text-zinc-500 mb-4">Are you sure you want to sign out?</p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setLogoutConfirm(false)}
                className="rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleLogout}
                className="rounded-md bg-zinc-950 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
