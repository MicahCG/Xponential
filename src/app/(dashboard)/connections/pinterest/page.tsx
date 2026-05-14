import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getCurrentBrand } from "@/lib/brand-context";
import { PinterestMethodStatus } from "@/components/connections/pinterest-method-status";
import { PinterestOAuthConnect } from "@/components/connections/pinterest-oauth-connect";

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
      status: true,
      accessToken: true,
      tokenExpires: true,
    },
  });

  const apiConnected = !!connection?.accessToken && connection.status === "active";

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

      <PinterestMethodStatus apiConnected={apiConnected} />

      <PinterestOAuthConnect
        connected={apiConnected}
        accountHandle={apiConnected ? (connection?.accountHandle ?? null) : null}
        tokenExpiresAt={
          apiConnected && connection?.tokenExpires
            ? connection.tokenExpires.toISOString()
            : null
        }
        brandName={brand.name}
      />
    </div>
  );
}
