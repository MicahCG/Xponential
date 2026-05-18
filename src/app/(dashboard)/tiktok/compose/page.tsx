import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth-helpers";
import {
  getCurrentConnection,
  listConnectionsForPlatform,
} from "@/lib/connection-context";
import { TikTokDraftComposer } from "@/components/tiktok/tiktok-draft-composer";
import { PlatformAccountPicker } from "@/components/connections/platform-account-picker";

export const metadata = { title: "TikTok draft - Xponential" };

export default async function TikTokComposePage() {
  const session = await requireAuth();
  const userId = session.user!.id as string;

  const [accounts, current] = await Promise.all([
    listConnectionsForPlatform(userId, "tiktok"),
    getCurrentConnection(userId, "tiktok"),
  ]);

  const apiConnected = !!current && current.hasAccessToken && current.status === "active";
  if (!apiConnected) {
    redirect("/connections/tiktok");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Send a TikTok draft</h1>
        <p className="text-muted-foreground">
          Sending via the official Content Posting API.
        </p>
        <div>
          <PlatformAccountPicker
            platform="tiktok"
            accounts={accounts}
            currentId={current?.id ?? null}
            connectHref="/api/connect/start/tiktok"
            label="TikTok account"
          />
        </div>
      </div>
      <TikTokDraftComposer />
    </div>
  );
}
