"use client";

import { useEffect, useState, useCallback, useRef, useSyncExternalStore } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import {
  Monitor,
  Settings,
  LogOut,
  FolderGit2,
  ChevronsUpDown,
  Plus,
  Check,
  Search,
} from "lucide-react";
import { api, Workspace } from "@/lib/api";
import { paths, workspaceSlugFromPath } from "@/lib/paths";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { WorkspaceAvatar } from "@/components/workspace-avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { CommandPalette } from "@/components/command-palette";
import { ThemeToggle } from "@/components/theme-toggle";

const emptySubscribe = () => () => {};
const getIsMac = () =>
  /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
const getIsMacServer = () => false;

interface User {
  id: string;
  login: string;
  avatar_url: string;
}

const navItems = [
  { href: "/workspaces", label: "Workspaces", icon: FolderGit2 },
  { href: "/daemons", label: "Daemons", icon: Monitor },
  { href: "/settings", label: "Settings", icon: Settings },
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
  const [paletteOpen, setPaletteOpen] = useState(false);
  const isMac = useSyncExternalStore(emptySubscribe, getIsMac, getIsMacServer);

  const [ws, setWs] = useState<{ slug: string; data: Workspace } | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const wsId = workspaceSlugFromPath(pathname);
  // Derived so a stale workspace is never shown when the route slug changes.
  const workspace = ws && ws.slug === wsId ? ws.data : null;

  useEffect(() => {
    api
      .get<User>("/api/v1/me")
      .then(setUser)
      .catch(() => router.push("/login"));
  }, [router]);

  useEffect(() => {
    api
      .get<Workspace[]>("/api/v1/workspaces")
      .then((d) => setWorkspaces(d || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!wsId) return;
    let cancelled = false;
    api
      .get<Workspace>(`/api/v1/workspaces/${wsId}`)
      .then((w) => {
        if (!cancelled) setWs({ slug: wsId, data: w });
      })
      .catch(() => {
        if (!cancelled) setWs(null);
      });
    return () => {
      cancelled = true;
    };
  }, [wsId]);

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
        {/* Logo / workspace switcher */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex h-16 w-full items-center gap-2 border-b border-hairline px-5 text-left outline-none transition-colors hover:bg-muted/40">
              {wsId && workspace ? (
                <>
                  <WorkspaceAvatar
                    name={workspace.name}
                    avatarUrl={workspace.avatar_url}
                    className="size-6"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">
                    {workspace.name}
                  </span>
                </>
              ) : (
                <>
                  <Image src="/favicon.ico" alt="GitSquad" width={20} height={20} className="size-5 rounded-sm" />
                  <span className="min-w-0 flex-1 text-sm font-semibold tracking-tight">GitSquad</span>
                </>
              )}
              <ChevronsUpDown className="size-3.5 shrink-0 text-mute" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
            {workspaces.map((w) => (
              <DropdownMenuItem
                key={w.id}
                onClick={() => router.push(paths.workspace(w.slug).board())}
              >
                <WorkspaceAvatar
                  name={w.name}
                  avatarUrl={w.avatar_url}
                  className="size-5"
                />
                <span className="min-w-0 flex-1 truncate">{w.name}</span>
                {wsId === w.slug && <Check className="size-4 shrink-0 text-ink" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push(paths.newWorkspace())}>
              <Plus className="size-4" />
              Create workspace
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Nav */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          <button
            onClick={() => setPaletteOpen(true)}
            className="flex w-full items-center gap-3 rounded-sm px-3 py-2 text-sm font-medium text-body transition-colors hover:bg-muted hover:text-ink"
          >
            <Search className="size-4" />
            <span>Search</span>
            <kbd className="pointer-events-none ml-auto inline-flex h-5 select-none items-center gap-0.5 rounded border border-hairline bg-muted px-1.5 font-mono text-xs text-mute">
              {isMac ? "⌘K" : "Ctrl K"}
            </kbd>
          </button>
          {navItems.map((item) => {
            const href =
              item.href === "/settings" && wsId
                ? paths.workspace(wsId).settings()
                : item.href;
            const active = pathname.startsWith(href);
            return (
              <button
                key={item.href}
                onClick={() => router.push(href)}
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
            <ThemeToggle />
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

      {/* Global command palette (Cmd/Ctrl+K) */}
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />

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
