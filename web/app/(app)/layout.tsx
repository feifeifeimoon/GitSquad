"use client";

import { useEffect, useState, useCallback, useRef, useSyncExternalStore } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { ChevronsUpDown, Plus, Check } from "lucide-react";
import { api, Workspace } from "@/lib/api";
import { useApi } from "@/lib/query";
import { RealtimeProvider } from "@/lib/realtime";
import { paths, workspaceSlugFromPath } from "@/lib/paths";
import { WorkspaceAvatar } from "@/components/workspace-avatar";
import { SidebarNav } from "@/components/sidebar-nav";
import { NavSearchTrigger } from "@/components/nav-search-trigger";
import { AccountMenu } from "@/components/account-menu";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { CommandPalette } from "@/components/command-palette";
import { NAV_JUMP, NAV_PAGES } from "@/lib/nav";
import { clampSidebarWidth, useSidebarWidth } from "@/lib/sidebar-width";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

const emptySubscribe = () => () => {};
const getIsMac = () =>
  /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
const getIsMacServer = () => false;

interface User {
  id: string;
  login: string;
  avatar_url: string;
}


export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useSidebarWidth();
  const dragging = useRef(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const isMac = useSyncExternalStore(emptySubscribe, getIsMac, getIsMacServer);

  const pathWorkspaceId = workspaceSlugFromPath(pathname);
  // Remember the last workspace slug so the workspace context (switcher +
  // nav) survives navigating to global pages like /workspaces or /daemons.
  const [lastWorkspaceSlug, setLastWorkspaceSlug] = useState<string | null>(null);
  if (pathWorkspaceId && pathWorkspaceId !== lastWorkspaceSlug) {
    setLastWorkspaceSlug(pathWorkspaceId);
  }
  const wsId = pathWorkspaceId ?? lastWorkspaceSlug;

  // Reads go through the cache, so the shell, the command palette and the
  // workspaces page share one request per path instead of one each.
  const { data: me, error: meError } = useApi<User>("/api/v1/me", () =>
    api.get<User>("/api/v1/me"),
  );
  const { data: workspaces = [] } = useApi<Workspace[]>("/api/v1/workspaces", () =>
    api.get<Workspace[]>("/api/v1/workspaces"),
  );
  // Keyed by the slug, so this cannot show one workspace's name while the route
  // is on another: a new slug is a new cache entry, and undefined until it
  // lands. That is what the `{ slug, data }` pairing used to guard against.
  const { data: workspace } = useApi<Workspace>(
    wsId ? `/api/v1/workspaces/${wsId}` : null,
    () => api.get<Workspace>(`/api/v1/workspaces/${wsId}`),
  );

  // On a failed identity read the session is not usable, so the shell hands
  // off to the login page rather than rendering a console with no user. The
  // token is left alone: `lib/api.ts` owns clearing it, and a network blip
  // should not sign anyone out.
  useEffect(() => {
    if (meError) router.push("/login");
  }, [meError, router]);

  const handleLogout = () => {
    localStorage.removeItem("gitsquad_token");
    router.push("/");
  };

  const onMouseDown = useCallback(() => {
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  // `g` then a letter jumps to a page. The palette answers "find a thing"; this
  // answers "go to a place" without opening anything, which is the fastest path
  // in a console you move around all day.
  useEffect(() => {
    let armed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const disarm = () => {
      armed = false;
      if (timer) clearTimeout(timer);
      timer = undefined;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      const target = event.target as HTMLElement | null;
      // Typing `g` into a field is typing, not a command.
      if (
        target &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }

      if (!armed) {
        if (event.key === "g") {
          armed = true;
          timer = setTimeout(disarm, 1200);
        }
        return;
      }

      const pageKey = NAV_JUMP[event.key.toLowerCase()];
      disarm();
      if (!pageKey) return;
      const page = NAV_PAGES.find((p) => p.key === pageKey);
      if (!page) return;
      event.preventDefault();
      // A workspace page has nowhere to go without a workspace, so the jump is
      // a no-op rather than an error — the same answer its disabled row gives.
      if (page.scope === "workspace") {
        if (wsId) router.push(page.href(wsId));
      } else {
        router.push(page.href());
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      disarm();
    };
  }, [router, wsId]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setSidebarWidth(clampSidebarWidth(e.clientX));
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
  }, [setSidebarWidth]);

  // Three planes: the page the content sits on, the chrome framing it, and the
  // surfaces — cards, panels — that sit on top of the page. The sidebar is its
  // own tone in both themes, which is what lets a card read as raised instead of
  // leaning on its border to say so.
  return (
    <div className="flex h-screen bg-page">
      {/* Sidebar */}
      <aside
        className="relative flex shrink-0 flex-col border-r border-hairline bg-chrome"
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
                  <span className="min-w-0 flex-1 truncate text-copy font-semibold tracking-tight">
                    {workspace.name}
                  </span>
                </>
              ) : (
                <>
                  <Image src="/favicon.ico" alt="GitSquad" width={20} height={20} className="size-5 rounded-sm" />
                  <span className="min-w-0 flex-1 text-copy font-semibold tracking-tight">GitSquad</span>
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

        {/* The fixed top block: identity above, the palette's trigger below it,
            both outside the scrolling list. The trigger is shaped like a field
            because it opens one — it is not a destination, so it does not sit
            among the destinations. */}
        <div className="border-b border-hairline px-3 pb-3 pt-2">
          <NavSearchTrigger
            onOpen={() => setPaletteOpen(true)}
            isMac={isMac}
          />
        </div>

        {/* Destinations. The only region that scrolls. */}
        <SidebarNav slug={wsId ?? undefined} />

        <AccountMenu
          login={me?.login}
          avatarUrl={me?.avatar_url}
          onSignOut={() => setLogoutConfirm(true)}
          trailing={<ThemeToggle />}
        />

        {/* Resize handle */}
        <div
          className="absolute right-0 top-0 h-full w-1 cursor-col-resize transition-colors hover:bg-hairline-strong"
          onMouseDown={onMouseDown}
        />
      </aside>

      {/* Main content. The realtime socket lives at this level, not inside the
          page, so navigating between routes does not tear the connection down
          and lose whatever arrived in the gap. */}
      <div className="flex-1 overflow-auto">
        <RealtimeProvider workspace={wsId ?? undefined}>{children}</RealtimeProvider>
      </div>

      {/* Global command palette (Cmd/Ctrl+K) */}
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />

      {/* Logout confirmation */}
      <Dialog open={logoutConfirm} onOpenChange={setLogoutConfirm}>
        <DialogContent className="sm:max-w-xs">
          <DialogTitle className="text-copy font-semibold text-ink">
            Sign out
          </DialogTitle>
          <p className="text-copy text-body">Are you sure you want to sign out?</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setLogoutConfirm(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleLogout}>
              Sign out
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
