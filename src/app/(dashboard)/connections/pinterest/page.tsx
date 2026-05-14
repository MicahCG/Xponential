import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getCurrentBrand } from "@/lib/brand-context";
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
      pinterestCookie: true,
      connectedAt: true,
    },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Connect Pinterest
        </h1>
        <p className="text-muted-foreground">
          Pinterest doesn&apos;t have OAuth approval yet, so we use cookie-based
          auth via Apify — just like the X path. Paste your Pinterest session
          cookie and we&apos;ll be able to publish pins for{" "}
          <span className="font-medium text-foreground">{brand.name}</span>.
        </p>
      </div>

      <PinterestConnectForm
        currentHandle={connection?.accountHandle ?? null}
        hasCookie={!!connection?.pinterestCookie}
        cookiePreview={
          connection?.pinterestCookie
            ? connection.pinterestCookie.slice(0, 40) + "…"
            : null
        }
        brandName={brand.name}
      />
    </div>
  );
}
