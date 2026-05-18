import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  promptTemplate: z.string().trim().min(1).max(4000).optional(),
  connectionId: z.string().min(1).optional(),
  durationSec: z.number().int().min(15).max(180).nullable().optional(),
  orientation: z.enum(["portrait", "landscape", "square"]).nullable().optional(),
  style: z.string().trim().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
});

async function loadOwnedChannel(channelId: string, userId: string) {
  return prisma.channel.findFirst({
    where: { id: channelId, userId },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const channel = await loadOwnedChannel(id, session.user.id);
  if (!channel) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.connectionId) {
    const conn = await prisma.platformConnection.findFirst({
      where: { id: parsed.data.connectionId, userId: session.user.id },
      select: { platform: true, status: true },
    });
    if (!conn) {
      return NextResponse.json(
        { error: "Target connection not found" },
        { status: 404 }
      );
    }
    if (conn.platform !== "tiktok") {
      return NextResponse.json(
        { error: "Phase 1 supports TikTok targets only." },
        { status: 400 }
      );
    }
  }

  const updated = await prisma.channel.update({
    where: { id: channel.id },
    data: parsed.data,
  });
  return NextResponse.json({ channel: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const channel = await loadOwnedChannel(id, session.user.id);
  if (!channel) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  await prisma.channel.delete({ where: { id: channel.id } });
  return NextResponse.json({ ok: true });
}
