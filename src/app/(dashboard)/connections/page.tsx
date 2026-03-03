import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PlatformCard } from "@/components/connections/platform-card";
import type { PlatformConnectionInfo } from "@/types";

export default async function ConnectionsPage() {
  const session = await requireAuth();

  const connections = await prisma.platformConnection.findMany({
    where: { userId: session.user!.id },
    select: {
      id: true,
      platform: true,
      accountHandle: true,
      connectedAt: true,
      status: true,
    },
  });

  const connectionMap = Object.fromEntries(
    connections.map((c) => [c.platform, c as PlatformConnectionInfo])
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Platform Connections
        </h1>
        <p className="text-muted-foreground">
          Connect your social media accounts to start posting
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <PlatformCard platform="x" connection={connectionMap.x} />
        <PlatformCard platform="linkedin" connection={connectionMap.linkedin} />
      </div>
    </div>
  );
}
