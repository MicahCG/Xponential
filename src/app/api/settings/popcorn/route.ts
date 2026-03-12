import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { settings: true },
  });

  const settings = (user?.settings ?? {}) as Record<string, unknown>;

  return NextResponse.json({
    popcornUserId:        (settings.popcornUserId as string)        ?? null,
    videoStyle:           (settings.videoStyle as string)           ?? "muppet",
    videoQuality:         (settings.videoQuality as string)         ?? "budget",
    videoDuration:        (settings.videoDuration as string)        ?? "15",
    videoOrientation:     (settings.videoOrientation as string)     ?? "vertical",
    videoPromptTemplate:  (settings.videoPromptTemplate as string)  ?? "Create a video based off this tweet {tweet_url}",
  });
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const {
    popcornUserId,
    videoStyle,
    videoQuality,
    videoDuration,
    videoOrientation,
    videoPromptTemplate,
  } = body as Record<string, string | undefined>;

  if (!popcornUserId || typeof popcornUserId !== "string" || !popcornUserId.trim()) {
    return NextResponse.json(
      { error: "Popcorn User ID is required" },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { settings: true },
  });

  const currentSettings = (user?.settings ?? {}) as Record<string, unknown>;
  const updatedSettings = {
    ...currentSettings,
    popcornUserId: popcornUserId.trim(),
    ...(videoStyle            && { videoStyle: videoStyle.trim() }),
    ...(videoQuality          && { videoQuality: videoQuality.trim() }),
    ...(videoDuration         && { videoDuration: videoDuration.trim() }),
    ...(videoOrientation      && { videoOrientation: videoOrientation.trim() }),
    ...(videoPromptTemplate   && { videoPromptTemplate: videoPromptTemplate.trim() }),
  };

  await prisma.user.update({
    where: { id: session.user.id },
    data: { settings: updatedSettings },
  });

  return NextResponse.json({ success: true });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { settings: true },
  });

  const currentSettings = (user?.settings ?? {}) as Record<string, unknown>;
  const { popcornUserId: _, ...rest } = currentSettings;

  await prisma.user.update({
    where: { id: session.user.id },
    data: { settings: JSON.parse(JSON.stringify(rest)) },
  });

  return NextResponse.json({ success: true });
}
