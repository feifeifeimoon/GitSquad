"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { LogOut, LayoutDashboard } from "lucide-react";
import { api } from "@/lib/api";
import { clearApi, useApi } from "@/lib/query";
import { paths } from "@/lib/paths";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface User {
  id: string;
  login: string;
  avatar_url: string;
}

// Read the token as an external store rather than during render: the server has
// no localStorage, so a plain read would hydrate against different output. Same
// shape as the console shell's platform check, except this one has subscribers
// — signing out has to re-render the button, and a stale `hasToken` would keep
// it asking for an identity that no longer exists.
const tokenListeners = new Set<() => void>();

function subscribeToken(listener: () => void): () => void {
  tokenListeners.add(listener);
  return () => tokenListeners.delete(listener);
}

const readHasToken = () => !!localStorage.getItem("gitsquad_token");
const serverHasToken = () => false;

export function AuthButton({ onLoginClick }: { onLoginClick?: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hasToken = useSyncExternalStore(
    subscribeToken,
    readHasToken,
    serverHasToken,
  );

  // Same key as the console shell, so moving between the landing page and the
  // console does not re-read the identity. Only asked for when a token exists —
  // `lib/api.ts` answers a 401 by sending the reader to /login, which is not
  // what an anonymous visitor to the landing page asked for.
  const { data: user } = useApi<User>(
    hasToken ? "/api/v1/me" : null,
    () => api.get<User>("/api/v1/me"),
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("gitsquad_token");
    // Evict rather than mark stale: the identity is not out of date, it is
    // gone, and a revalidation would only 401 its way to the login page.
    clearApi("/api/v1/me");
    for (const listener of tokenListeners) listener();
    setOpen(false);
  };

  if (user) {
    return (
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 rounded-full border border-hairline p-0.5 transition-colors hover:border-hairline-strong"
        >
          {/* The Avatar primitive, not a bare <Image>: an account with no
              picture has an empty avatar_url, and an <img src=""> paints a
              broken-image glyph in the corner of the marketing nav. The
              fallback is what actually renders for those accounts. */}
          <Avatar className="size-7 text-micro uppercase">
            <AvatarImage src={user.avatar_url} alt={user.login} />
            <AvatarFallback className="uppercase">
              {user.login.slice(0, 2)}
            </AvatarFallback>
          </Avatar>
        </button>

        {open && (
          <div className="absolute right-0 top-11 w-48 rounded-md border border-hairline bg-canvas py-1 shadow-level-4 z-50">
              <div className="border-b border-hairline px-3 py-2">
                <p className="text-copy font-semibold text-ink">@{user.login}</p>
              </div>
              <button
                onClick={() => { router.push(paths.workspaces()); setOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-copy text-body transition-colors hover:bg-muted hover:text-ink"
              >
                <LayoutDashboard className="size-3.5" />
                Console
              </button>
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2 px-3 py-2 text-copy text-body transition-colors hover:bg-muted hover:text-ink"
              >
                <LogOut className="size-3.5" />
                Logout
              </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <Button
      size="sm"
      onClick={() => {
        if (onLoginClick) {
          onLoginClick();
        } else {
          router.push("/login");
        }
      }}
    >
      Login
    </Button>
  );
}
