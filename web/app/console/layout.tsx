"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { Monitor, Settings, LogOut, FolderGit2 } from "lucide-react";
import { api } from "@/lib/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface User {
  id: string;
  login: string;
  avatar_url: string;
}

const navItems = [
  { href: "/console/workspaces", label: "Workspaces", icon: FolderGit2 },
  { href: "/console/daemons", label: "Daemons", icon: Monitor },
  { href: "/console/settings", label: "Settings", icon: Settings },
];

const MIN_WIDTH = 200;
const MAX_WIDTH = 400;
const DEFAULT_WIDTH = 240;

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH);
  const dragging = useRef(false);

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

  const onMouseDown = useCallback(() => {
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX));
      setSidebarWidth(next);
    };
    const onMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  return (
    <div className="flex h-screen bg-canvas">
      {/* Sidebar */}
      <aside
        className="relative flex shrink-0 flex-col border-r border-hairline bg-canvas"
        style={{ width: sidebarWidth }}
      >
        {/* Logo */}
        <div className="flex h-16 items-center gap-2 border-b border-hairline px-5">
          <Image src="/favicon.ico" alt="GitSquad" width={20} height={20} className="size-5 rounded-sm" />
          <span className="text-sm font-semibold tracking-tight">GitSquad</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={`relative flex w-full items-center gap-3 rounded-sm px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-muted text-ink"
                    : "text-body hover:bg-muted hover:text-ink"
                }`}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
                )}
                <item.icon className="size-4" />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* User */}
        <div className="border-t border-hairline px-3 py-4">
          <div className="flex items-center gap-3">
            <Avatar className="size-8">
              <AvatarImage src={user?.avatar_url} />
              <AvatarFallback className="text-xs">
                {user?.login?.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">
                @{user?.login}
              </p>
            </div>
            <button
              onClick={() => setLogoutConfirm(true)}
              className="text-mute transition-colors hover:text-ink"
              title="Logout"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>

        {/* Resize handle */}
        <div
          className="absolute right-0 top-0 h-full w-1 cursor-col-resize transition-colors hover:bg-hairline-strong"
          onMouseDown={onMouseDown}
        />
      </aside>

      {/* Main content */}
      <div className="flex-1 overflow-auto">{children}</div>

      {/* Logout confirmation */}
      {logoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
          <div className="max-w-xs rounded-lg border border-hairline bg-canvas p-6 shadow-level-5">
            <p className="mb-1 text-sm font-semibold text-ink">Sign out</p>
            <p className="mb-4 text-sm text-body">Are you sure you want to sign out?</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setLogoutConfirm(false)}
                className="rounded-sm px-3 py-1.5 text-sm text-body transition-colors hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleLogout}
                className="rounded-sm bg-primary px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary/85"
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
