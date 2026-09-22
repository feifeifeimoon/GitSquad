"use client";

import Link from "next/link";
import { ChevronsUpDown, UserCog } from "lucide-react";
import { paths } from "@/lib/paths";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

/**
 * The account, behind the account.
 *
 * The footer used to be four things in a row — avatar, handle, a theme icon, a
 * sign-out icon — two of which were unlabelled glyphs, and none of which was
 * where you would look for your own settings. The whole block is the trigger
 * now, and the menu holds the two decisions that are about you rather than
 * about the product: your settings, and leaving.
 *
 * This is also what made the account settings reachable again. They used to be
 * the product group's "Settings" row, which rewrote its own href to the
 * *workspace* settings whenever a workspace was in view — so `/settings` had no
 * entry in the sidebar at all for anyone who had opened a workspace. The
 * workspace's settings are a workspace page and live in that group; these are
 * yours and live behind your avatar.
 *
 * Linear does the same; multica inverts it and puts the account in the top-left
 * switcher instead. Either is coherent — what neither does is put it in the
 * middle of the navigation list.
 */
export function AccountMenu({
  login,
  avatarUrl,
  onSignOut,
  trailing,
}: {
  login?: string;
  avatarUrl?: string;
  onSignOut: () => void;
  /** Sits at the row's right edge — the one-click controls that are not the menu. */
  trailing?: React.ReactNode;
}) {
  return (
    <div className="border-t border-hairline p-2">
      <div className="flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/60 data-[state=open]:bg-muted">
              <Avatar className="size-7 shrink-0">
                <AvatarImage src={avatarUrl} alt="" />
                <AvatarFallback aria-hidden="true" className="text-micro uppercase">
                  {login?.slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 truncate text-label font-medium text-ink">
                @{login}
              </span>
              <ChevronsUpDown className="size-3.5 shrink-0 text-mute" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-56">
            {/* Identity, so the menu says whose it is before it offers to
                change anything. Not interactive — there is nothing to open. */}
            <DropdownMenuLabel className="flex items-center gap-2.5 py-1.5">
              <Avatar className="size-8 shrink-0">
                <AvatarImage src={avatarUrl} alt="" />
                <AvatarFallback aria-hidden="true" className="text-caption uppercase">
                  {login?.slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 truncate text-copy font-medium text-ink">
                @{login}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={paths.settings()}>
                <UserCog className="size-4" />
                Account settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onSignOut}>
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {/* Kept as a visible one-click control rather than a menu item: it is
            the kind of thing you flip back and forth while working, and burying
            a toggle behind a menu is a convenience regression. */}
        {trailing}
      </div>
    </div>
  );
}
