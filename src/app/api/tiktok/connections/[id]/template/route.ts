import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Template management for a TikTok connection. Each TikTok account has
 * exactly one Channel (auto-created on first GET) whose promptTemplate
 * is the video prompt the user edits on the TikTok page.
 *
 * GET  → returns the current template + recent runs
 * PUT  → updates the template text + optional duration/orientation/style
 */

async function getOrCreateChannel(connectionId: string, userId: string) {
  const conn = await prisma.platformConnection.findFirst({
    where: { id: connectionId, userId, platform: "tiktok" },
    select: { id: true, workspaceId: true, accountHandle: true },
  });
  if (!conn) return null;

  const existing = await prisma.channel.findFirst({
    where: { userId, connectionId: conn.id },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return { channel: existing, connection: conn };

  const created = await prisma.channel.create({
    data: {
      userId,
      workspaceId: conn.workspaceId,
      connectionId: conn.id,
      name: `@${conn.accountHandle ?? "tiktok"} default`,
      promptTemplate: "",
    },
  });
  return { channel: created, connection: conn };
}

const putSchema = z.object({
  promptTemplate: z.string().max(100000),
  durationSec: z.number().int().min(15).max(180).nullable().optional(),
  orientation: z
    .enum(["portrait", "landscape", "square"])
    .nullable()
    .optional(),
  style: z.string().trim().max(500).nullable().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const found = await getOrCreateChannel(id, session.user.id);
  if (!found) {
    return NextResponse.json(
      { error: "TikTok connection not found" },
      { status: 404 }
    );
  }

  const recentRuns = await prisma.channelRun.findMany({
    where: { channelId: found.channel.id },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      status: true,
      videoUrl: true,
      platformPostId: true,
      errorMessage: true,
      popcornMovieId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    channelId: found.channel.id,
    promptTemplate: found.channel.promptTemplate,
    durationSec: found.channel.durationSec,
    orientation: found.channel.orientation,
    style: found.channel.style,
    recentRuns,
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const body = await request.json();
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const found = await getOrCreateChannel(id, session.user.id);
  if (!found) {
    return NextResponse.json(
      { error: "TikTok connection not found" },
      { status: 404 }
    );
  }

  const updated = await prisma.channel.update({
    where: { id: found.channel.id },
    data: {
      promptTemplate: parsed.data.promptTemplate,
      ...(parsed.data.durationSec !== undefined && {
        durationSec: parsed.data.durationSec,
      }),
      ...(parsed.data.orientation !== undefined && {
        orientation: parsed.data.orientation,
      }),
      ...(parsed.data.style !== undefined && { style: parsed.data.style }),
    },
  });

  return NextResponse.json({
    channelId: updated.id,
    promptTemplate: updated.promptTemplate,
  });
}
