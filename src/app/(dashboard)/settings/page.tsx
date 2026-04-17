import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { TwitterCookieForm } from "@/components/settings/twitter-cookie-form";
import { PopcornForm } from "@/components/settings/popcorn-form";
import { PlatformCard } from "@/components/connections/platform-card";
import type { PlatformConnectionInfo } from "@/types";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default async function SettingsPage() {
  const session = await requireAuth();

  const xConnections = await prisma.platformConnection.findMany({
    where: {
      userId: session.user!.id!,
      platform: "x",
    },
    select: {
      id: true,
      platform: true,
      accountHandle: true,
      connectedAt: true,
      status: true,
      twitterCookie: true,
    },
    orderBy: { connectedAt: "asc" },
  });

  const connectionInfos: PlatformConnectionInfo[] = xConnections.map((c) => ({
    id: c.id,
    platform: c.platform,
    accountHandle: c.accountHandle,
    connectedAt: c.connectedAt,
    status: c.status,
    hasCookie: !!c.twitterCookie,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account and automation preferences
        </p>
      </div>
      {connectionInfos.map((conn) => (
        <PlatformCard key={conn.id} platform="x" connection={conn} />
      ))}
      {connectionInfos.length === 0 && (
        <PlatformCard platform="x" />
      )}
      <Button asChild variant="outline" className="gap-2">
        <a href="/api/connect/start/x">
          <Plus className="h-4 w-4" />
          Connect another X account
        </a>
      </Button>
      <TwitterCookieForm />
      <PopcornForm />
    </div>
  );
}
