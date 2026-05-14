import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getCurrentBrand } from "@/lib/brand-context";
import { PinterestMethodStatus } from "@/components/connections/pinterest-method-status";
import { PinterestOAuthConnect } from "@/components/connections/pinterest-oauth-connect";
import { PinterestConnectForm } from "@/components/connections/pinterest-connect-form";

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
      pinterestCookie: true,
    },
  });

  const apiConnected = !!connection?.accessToken && connection.status === "active";
  const cookieConfigured = !!connection?.pinterestCookie;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Connect Pinterest</h1>
        <p className="text-muted-foreground">
          Connecting Pinterest to{" "}
          <span className="font-medium text-foreground">{brand.name}</span>. The
          Official Pinterest API is the production path; the cookie fallback
          below is for internal testing only.
        </p>
      </div>

      <PinterestMethodStatus
        apiConnected={apiConnected}
        cookieConfigured={cookieConfigured}
      />

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

      <details className="group">
        <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
          Show internal cookie fallback
        </summary>
        <div className="mt-4">
          <PinterestConnectForm
            currentHandle={connection?.accountHandle ?? null}
            hasCookie={cookieConfigured}
            cookiePreview={
              connection?.pinterestCookie
                ? connection.pinterestCookie.slice(0, 40) + "…"
                : null
            }
            brandName={brand.name}
          />
        </div>
      </details>
    </div>
  );
}
