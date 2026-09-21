import { UserSettings } from "@/components/settings/user-settings";
import { PageHeader } from "@/components/page-header";

export default function SettingsPage() {
  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Settings" />
      <div className="mx-auto w-full max-w-2xl flex-1 px-8 pb-8 pt-6">
        <UserSettings />
      </div>
    </div>
  );
}
