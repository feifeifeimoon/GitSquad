"use client";

import { useEffect, useState, useCallback, useRef, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { api, Workspace } from "@/lib/api";
import { useApi } from "@/lib/query";
import { RealtimeProvider } from "@/lib/realtime";
import { paths, workspaceSlugFromPath } from "@/lib/paths";
import { GitSquadMark } from "@/components/gitsquad-mark";
import { SidebarNav } from "@/components/sidebar-nav";
import { NavSearchTrigger } from "@/components/nav-search-trigger";
import { AccountMenu } from "@/components/account-menu";
import { ScopeSwitcher } from "@/components/scope-switcher";
import { CommandPalette } from "@/components/command-palette";
import { consoleTitle, navPageByJump, navPageHref } from "@/lib/nav";
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

  // The console's scope, and it comes from the URL and nowhere else. It used to
  // be remembered in component state so that global pages kept the workspace
  // they were visited from — which meant a fresh load of /workspaces, or of
  // /daemons, had no workspace at all and drew the workspace pages greyed out.
  // A scope that is inferred is a scope that can be missing; this one cannot.
  // With no slug the scope is All Workspaces, which is a page you can be on
  // rather than a state the console can be in.
  const slug = workspaceSlugFromPath(pathname) ?? undefined;

  // Reads go through the cache, so the shell, the scope switcher and the
  // workspaces page share one request per path instead of one each.
  const { data: me, error: meError } = useApi<User>("/api/v1/me", () =>
    api.get<User>("/api/v1/me"),
  );
  const { data: workspaces = [] } = useApi<Workspace[]>("/api/v1/workspaces", () =>
    api.get<Workspace[]>("/api/v1/workspaces"),
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
  //
  // The scope decides which letters exist: `g i` is Issues in a workspace and
  // nothing at all in All Workspaces, because there is no Issues page to reach
  // — the same answer the sidebar gives by not drawing the row.
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

      const page = navPageByJump(event.key.toLowerCase());
      disarm();
      if (!page) return;
      const href = navPageHref(page, slug ?? null);
      if (!href) return;
      event.preventDefault();
      router.push(href);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      disarm();
    };
  }, [router, slug]);

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
        {/* The product, and only the product. This used to be the workspace
            switcher, from back when the scope lived at the top of the sidebar;
            the scope is chosen above the page now, and what is left here is
            where "home" is — the All Workspaces list. */}
        <Link
          href={paths.workspaces()}
          className="flex h-16 items-center gap-2 border-b border-hairline px-5 outline-none transition-colors hover:bg-muted/40"
        >
          <GitSquadMark className="size-6 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-copy font-semibold tracking-tight">
            GitSquad
          </span>
        </Link>

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
        <SidebarNav slug={slug} />

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

      {/* The page column: the bar, then the page.
          The bar answers both halves of "where am I" in one line — which
          workspace on the left, which page in the middle — and it is outside
          the scroll region, so the answer never scrolls away. It is Vercel's
          bar with our two scopes in it; the title moved up here from the first
          row of every page, where it was the first thing to leave the viewport
          on a long page and the second thing to say where you were. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="grid h-16 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-hairline px-4">
          <ScopeSwitcher slug={slug} workspaces={workspaces} />
          <h1 className="min-w-0 truncate text-title font-semibold tracking-[-0.01em] text-ink">
            {consoleTitle(pathname, slug ?? null)}
          </h1>
          <div />
        </div>

        {/* The realtime socket lives at this level, not inside the page, so
            navigating between routes does not tear the connection down and lose
            whatever arrived in the gap. It is scoped to a workspace, so in All
            Workspaces there is no socket at all: the aggregate has no channel
            of its own yet. */}
        <div className="min-h-0 flex-1 overflow-auto">
          <RealtimeProvider workspace={slug}>{children}</RealtimeProvider>
        </div>
      </div>

      {/* Global command palette (Cmd/Ctrl+K) */}
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        slug={slug}
      />

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
