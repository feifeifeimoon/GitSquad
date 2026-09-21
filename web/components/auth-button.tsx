"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, LayoutDashboard } from "lucide-react";
import { api } from "@/lib/api";
import { paths } from "@/lib/paths";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface User {
  id: string;
  login: string;
  avatar_url: string;
}

export function AuthButton({ onLoginClick }: { onLoginClick?: () => void }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const token = localStorage.getItem("gitsquad_token");
    if (!token) return;

    api
      .get<User>("/api/v1/me")
      .then(setUser)
      .catch(() => localStorage.removeItem("gitsquad_token"));
  }, []);

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
    setUser(null);
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
