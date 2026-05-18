import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspace-context";

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  promptTemplate: z.string().trim().min(1).max(100000),
  connectionId: z.string().min(1),
  durationSec: z.number().int().min(15).max(180).optional(),
  orientation: z.enum(["portrait", "landscape", "square"]).optional(),
  style: z.string().trim().max(500).optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const workspace = await getCurrentWorkspace(session.user.id);

  const channels = await prisma.channel.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { createdAt: "desc" },
    include: {
      connection: {
        select: { id: true, platform: true, accountHandle: true, status: true },
      },
      runs: {
        orderBy: { createdAt: "desc" },
        take: 3,
        select: {
          id: true,
          status: true,
          createdAt: true,
          videoUrl: true,
          platformPostId: true,
          errorMessage: true,
        },
      },
    },
  });

  return NextResponse.json({ channels });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const workspace = await getCurrentWorkspace(session.user.id);

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Verify the target connection belongs to this user
  const conn = await prisma.platformConnection.findFirst({
    where: {
      id: parsed.data.connectionId,
      userId: session.user.id,
    },
    select: { id: true, platform: true, status: true },
  });
  if (!conn) {
    return NextResponse.json(
      { error: "Target connection not found" },
      { status: 404 }
    );
  }
  if (conn.platform !== "tiktok") {
    return NextResponse.json(
      {
        error:
          "Phase 1 supports TikTok targets only. Instagram support comes when the platform is built.",
      },
      { status: 400 }
    );
  }
  if (conn.status !== "active") {
    return NextResponse.json(
      { error: "Target connection is not active. Reconnect first." },
      { status: 400 }
    );
  }

  const channel = await prisma.channel.create({
    data: {
      userId: session.user.id,
      workspaceId: workspace.id,
      connectionId: parsed.data.connectionId,
      name: parsed.data.name,
      promptTemplate: parsed.data.promptTemplate,
      durationSec: parsed.data.durationSec,
      orientation: parsed.data.orientation,
      style: parsed.data.style,
    },
  });

  return NextResponse.json({ channel }, { status: 201 });
}
