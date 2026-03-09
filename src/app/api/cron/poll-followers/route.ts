import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getValidAccessToken, getUserProfileFull } from "@/lib/platform/x-client";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const connections = await prisma.platformConnection.findMany({
    where: { platform: "x", status: "active" },
    select: { userId: true },
  });

  let snapped = 0;
  const errors: string[] = [];

  for (const { userId } of connections) {
    try {
      const accessToken = await getValidAccessToken(userId);
      const profile = await getUserProfileFull(accessToken);

      await prisma.followerSnapshot.create({
        data: {
          userId,
          platform: "x",
          followers: profile.followerCount,
        },
      });

      snapped++;
      console.log(`[poll-followers] Snapped ${profile.followerCount} followers for user ${userId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      errors.push(`User ${userId}: ${msg}`);
      console.error(`[poll-followers] Error for user ${userId}:`, err);
    }
  }

  return NextResponse.json({ success: true, snapped, errors });
}
