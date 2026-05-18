import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getCurrentBrand } from "@/lib/brand-context";
import { TikTokDraftComposer } from "@/components/tiktok/tiktok-draft-composer";

export const metadata = { title: "TikTok draft - Xponential" };

export default async function TikTokComposePage() {
  const session = await requireAuth();
  const brand = await getCurrentBrand(session.user!.id as string);

  const connection = await prisma.platformConnection.findFirst({
    where: { brandId: brand.id, platform: "tiktok" },
    select: {
      accountHandle: true,
      accessToken: true,
      status: true,
    },
  });

  const apiConnected =
    !!connection?.accessToken && connection.status === "active";

  if (!apiConnected) {
    redirect("/connections/tiktok");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Send a TikTok draft</h1>
        <p className="text-muted-foreground">
          Sending to{" "}
          <span className="font-medium text-foreground">
            @{connection?.accountHandle}
          </span>{" "}
          on TikTok via the official Content Posting API for{" "}
          <span className="font-medium text-foreground">{brand.name}</span>.
        </p>
      </div>
      <TikTokDraftComposer />
    </div>
  );
}
