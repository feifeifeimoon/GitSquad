"use client";

import { api } from "@/lib/api";
import { useApi } from "@/lib/query";
import { PageHeader } from "@/components/page-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  SettingRow,
  SettingSection,
} from "@/components/settings/settings-layout";

interface User {
  id: string;
  login: string;
  avatar_url: string;
}

/**
 * The account's settings — yours, not the workspace's.
 *
 * Reached from the avatar in the footer, or `Account settings` in the palette.
 * It used to share a `UserSettings` component with the workspace settings page,
 * which is how the account's Profile ended up rendering at the top of a page
 * called "Workspace settings". The two are one page each now, and the titles
 * say which is which.
 *
 * The "Daemon Tokens" section that used to sit here promised a control that
 * does not exist ("available in the next update"). Nothing is shown until there
 * is something to show.
 */
export default function AccountSettingsPage() {
  const { data: user } = useApi<User>("/api/v1/me", () =>
    api.get<User>("/api/v1/me"),
  );

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Account settings" />

      <div className="mx-auto w-full max-w-2xl flex-1 px-8 pb-8 pt-6">
        <SettingSection title="Profile">
          <SettingRow
            leading={
              <Avatar className="size-10">
                <AvatarImage src={user?.avatar_url} alt="" />
                <AvatarFallback aria-hidden="true" className="text-label uppercase">
                  {user?.login?.slice(0, 2)}
                </AvatarFallback>
              </Avatar>
            }
            label={user ? `@${user.login}` : "—"}
            description="Connected via Google"
          />
        </SettingSection>
      </div>
    </div>
  );
}
