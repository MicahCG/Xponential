import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentBrand } from "@/lib/brand-context";

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const brand = await getCurrentBrand(session.user.id);

  // Clear OAuth tokens. There's no cookie fallback for TikTok, so this fully
  // disconnects. PostHistory and TikTokApiLog rows remain for audit.
  const updated = await prisma.platformConnection.updateMany({
    where: { brandId: brand.id, platform: "tiktok" },
    data: {
      accessToken: "",
      refreshToken: null,
      tokenExpires: null,
    },
  });

  return NextResponse.json({ updated: updated.count });
}
