import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createMovie, PopcornError } from "@/lib/popcorn/client";

/**
 * Kick off a new ChannelRun. Creates the row, calls Popcorn to start movie
 * generation, returns immediately with the run id. UI polls
 * /api/channels/[id]/runs/[runId] to advance the state machine
 * (generating → ready → posting → posted | failed).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const channel = await prisma.channel.findFirst({
    where: { id, userId: session.user.id },
    include: {
      connection: { select: { id: true, status: true, accountHandle: true, platform: true } },
    },
  });
  if (!channel) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }
  if (channel.connection.status !== "active") {
    return NextResponse.json(
      { error: "Target connection is not active. Reconnect it first." },
      { status: 400 }
    );
  }
  if (channel.connection.platform !== "tiktok") {
    return NextResponse.json(
      { error: "Phase 1 only supports TikTok targets." },
      { status: 400 }
    );
  }

  // Create a pending run row first so the UI can poll immediately even if
  // Popcorn is slow to respond.
  const run = await prisma.channelRun.create({
    data: {
      channelId: channel.id,
      userId: session.user.id,
      promptUsed: channel.promptTemplate,
      status: "generating",
    },
  });

  try {
    const movie = await createMovie({
      brief: channel.promptTemplate,
      duration: channel.durationSec ?? undefined,
      orientation:
        (channel.orientation as "portrait" | "landscape" | "square" | null) ??
        undefined,
      style: channel.style ?? undefined,
    });

    await prisma.channelRun.update({
      where: { id: run.id },
      data: { popcornMovieId: movie.id },
    });

    return NextResponse.json({
      ok: true,
      runId: run.id,
      popcornMovieId: movie.id,
      status: "generating",
    });
  } catch (err) {
    const message =
      err instanceof PopcornError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Failed to start Popcorn movie";
    await prisma.channelRun.update({
      where: { id: run.id },
      data: { status: "failed", errorMessage: message },
    });
    return NextResponse.json(
      { error: message, runId: run.id },
      { status: err instanceof PopcornError ? err.httpCode ?? 502 : 500 }
    );
  }
}
