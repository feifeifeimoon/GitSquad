import { UserSettings } from "@/components/settings/user-settings";

export default function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-8 pt-8 pb-8">
      <h1 className="mb-6 text-lg font-semibold text-ink">Settings</h1>
      <UserSettings />
    </div>
  );
}
