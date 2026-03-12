import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/video-posts — list recent video posts for the current user
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const posts = await prisma.videoPost.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json({ posts });
}

// POST /api/video-posts — create a new video post job
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const tweetText = (body.tweetText as string)?.trim();
  const videoPrompt = (body.videoPrompt as string)?.trim();

  if (!tweetText) {
    return NextResponse.json({ error: "tweetText is required" }, { status: 400 });
  }
  if (!videoPrompt) {
    return NextResponse.json({ error: "videoPrompt is required" }, { status: 400 });
  }
  if (tweetText.length > 280) {
    return NextResponse.json({ error: "Tweet text too long (max 280 chars)" }, { status: 400 });
  }

  // Verify user has popcornUserId configured
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { settings: true },
  });
  const settings = (user?.settings ?? {}) as Record<string, unknown>;
  if (!settings.popcornUserId) {
    return NextResponse.json(
      { error: "Popcorn User ID not configured. Add it in Settings." },
      { status: 400 }
    );
  }

  const post = await prisma.videoPost.create({
    data: {
      userId: session.user.id,
      tweetText,
      videoPrompt,
      status: "pending",
    },
  });

  return NextResponse.json({ post });
}
