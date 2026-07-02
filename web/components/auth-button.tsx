"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { LogOut, LayoutDashboard } from "lucide-react";
import { api } from "@/lib/api";

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
          className="flex items-center gap-2 rounded-full border border-zinc-200 p-0.5 transition-colors hover:border-zinc-300"
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
          <div className="absolute right-0 top-11 w-48 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg z-50">
              <div className="px-3 py-2 border-b border-zinc-100">
                <p className="text-sm font-semibold text-zinc-950">@{user.login}</p>
              </div>
              <button
                onClick={() => { router.push("/console"); setOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
              >
                <LayoutDashboard className="size-3.5" />
                Console
              </button>
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
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
    <button
      onClick={() => {
        if (onLoginClick) {
          onLoginClick();
        } else {
          router.push("/login");
        }
      }}
      className="inline-flex items-center rounded-md bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 transition-colors"
    >
      Login
    </button>
  );
}
