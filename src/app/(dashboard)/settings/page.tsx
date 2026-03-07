import { TwitterCookieForm } from "@/components/settings/twitter-cookie-form";
import { PopcornForm } from "@/components/settings/popcorn-form";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account and automation preferences
        </p>
      </div>
      <TwitterCookieForm />
      <PopcornForm />
    </div>
  );
}
