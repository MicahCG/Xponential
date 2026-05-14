import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getCurrentBrand } from "@/lib/brand-context";
import { PinComposer } from "@/components/pinterest/pin-composer";

export const metadata = { title: "Compose pin - Xponential" };

export default async function ComposePinPage() {
  const session = await requireAuth();
  const brand = await getCurrentBrand(session.user!.id as string);

  const connection = await prisma.platformConnection.findFirst({
    where: { brandId: brand.id, platform: "pinterest" },
    select: {
      accountHandle: true,
      accessToken: true,
      status: true,
    },
  });

  const apiConnected =
    !!connection?.accessToken && connection.status === "active";

  if (!apiConnected) {
    redirect("/connections/pinterest");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Compose a pin</h1>
        <p className="text-muted-foreground">
          Publishing to{" "}
          <span className="font-medium text-foreground">
            @{connection?.accountHandle}
          </span>{" "}
          on Pinterest via the official API for{" "}
          <span className="font-medium text-foreground">{brand.name}</span>.
        </p>
      </div>
      <PinComposer />
    </div>
  );
}
