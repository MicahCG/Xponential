import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Platform } from "@prisma/client";

const VALID_PLATFORMS: Platform[] = ["x", "pinterest", "tiktok"];

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Optional platform filter — important so /content's X picker doesn't pick up
  // Pinterest/TikTok rows from the same user.
  const platformParam = request.nextUrl.searchParams.get("platform");
  const platform =
    platformParam && (VALID_PLATFORMS as string[]).includes(platformParam)
      ? (platformParam as Platform)
      : null;

  const connections = await prisma.platformConnection.findMany({
    where: {
      userId: session.user.id,
      ...(platform && { platform }),
    },
    select: {
      id: true,
      platform: true,
      accountHandle: true,
      connectedAt: true,
      status: true,
    },
    orderBy: [{ status: "asc" }, { connectedAt: "desc" }],
  });

  return NextResponse.json(connections);
}
