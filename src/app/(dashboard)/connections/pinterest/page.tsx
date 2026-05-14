import Link from "next/link";
import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getCurrentBrand } from "@/lib/brand-context";
import { PinterestMethodStatus } from "@/components/connections/pinterest-method-status";
import { PinterestOAuthConnect } from "@/components/connections/pinterest-oauth-connect";
import { PinterestConnectedDashboard } from "@/components/connections/pinterest-connected-dashboard";

export const metadata = {
  title: "Connect Pinterest - Xponential",
};

export default async function PinterestConnectPage() {
  const session = await requireAuth();
  const brand = await getCurrentBrand(session.user!.id as string);

  const connection = await prisma.platformConnection.findFirst({
    where: { brandId: brand.id, platform: "pinterest" },
    select: {
      id: true,
      accountHandle: true,
      accountId: true,
      status: true,
      accessToken: true,
      tokenExpires: true,
      scopes: true,
    },
  });

  const apiConnected =
    !!connection?.accessToken && connection.status === "active";

  if (apiConnected) {
    const recentLogs = await prisma.pinterestApiLog.findMany({
      where: { brandId: brand.id },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: {
        id: true,
        method: true,
        endpoint: true,
        responseStatus: true,
        success: true,
        createdAt: true,
      },
    });

    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Pinterest connection
          </h1>
          <p className="text-muted-foreground">
            Official Pinterest API connected for{" "}
            <span className="font-medium text-foreground">{brand.name}</span>.
          </p>
        </div>

        <PinterestConnectedDashboard
          brandName={brand.name}
          accountHandle={connection?.accountHandle ?? null}
          accountId={connection?.accountId ?? null}
          scopes={connection?.scopes ?? null}
          tokenExpiresAt={connection?.tokenExpires ?? null}
          recentLogs={recentLogs}
        />

        <p className="text-center text-xs text-muted-foreground">
          Xponential&apos;s handling of Pinterest data is described in our{" "}
          <Link
            href="/privacy"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Connect Pinterest</h1>
        <p className="text-muted-foreground">
          Connect{" "}
          <span className="font-medium text-foreground">{brand.name}</span> to
          Pinterest via the official Pinterest API. Each pin is published only
          when a human clicks Publish.
        </p>
      </div>

      <PinterestMethodStatus apiConnected={false} />

      <PinterestOAuthConnect
        connected={false}
        accountHandle={null}
        tokenExpiresAt={null}
        brandName={brand.name}
      />

      <p className="text-center text-xs text-muted-foreground">
        Connecting Pinterest authorizes Xponential to publish pins on your
        behalf, as described in our{" "}
        <Link
          href="/privacy"
          className="underline underline-offset-2 hover:text-foreground"
        >
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
