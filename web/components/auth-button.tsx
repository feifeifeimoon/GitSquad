"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { LogOut, LayoutDashboard } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

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
          <Image
            src={user.avatar_url}
            alt={user.login}
            width={28}
            height={28}
            className="size-7 rounded-full"
          />
        </button>

        {open && (
          <div className="absolute right-0 top-11 w-48 rounded-md border border-hairline bg-canvas py-1 shadow-level-4 z-50">
              <div className="border-b border-hairline px-3 py-2">
                <p className="text-sm font-semibold text-ink">@{user.login}</p>
              </div>
              <button
                onClick={() => { router.push("/console"); setOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-body transition-colors hover:bg-muted hover:text-ink"
              >
                <LayoutDashboard className="size-3.5" />
                Console
              </button>
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-body transition-colors hover:bg-muted hover:text-ink"
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
      size="pill-sm"
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
