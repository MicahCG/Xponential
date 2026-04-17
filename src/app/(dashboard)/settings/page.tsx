import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { TwitterCookieForm } from "@/components/settings/twitter-cookie-form";
import { PopcornForm } from "@/components/settings/popcorn-form";
import { PlatformCard } from "@/components/connections/platform-card";
import type { PlatformConnectionInfo } from "@/types";

export default async function SettingsPage() {
  const session = await requireAuth();

  const xConnection = await prisma.platformConnection.findUnique({
    where: {
      userId_platform: {
        userId: session.user!.id!,
        platform: "x",
      },
    },
    select: {
      id: true,
      platform: true,
      accountHandle: true,
      connectedAt: true,
      status: true,
      twitterCookie: true,
    },
  });

  const connectionInfo: PlatformConnectionInfo | undefined = xConnection
    ? {
        id: xConnection.id,
        platform: xConnection.platform,
        accountHandle: xConnection.accountHandle,
        connectedAt: xConnection.connectedAt,
        status: xConnection.status,
        hasCookie: !!xConnection.twitterCookie,
      }
    : undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account and automation preferences
        </p>
      </div>
      <PlatformCard platform="x" connection={connectionInfo} />
      <TwitterCookieForm />
      <PopcornForm />
    </div>
  );
}
