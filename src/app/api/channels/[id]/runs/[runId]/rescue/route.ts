import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getMovie, normalizeStatus, PopcornError } from "@/lib/popcorn/client";

/**
 * Rescue a ChannelRun that got marked "failed" while its Popcorn movie
 * actually completed. Checks Popcorn for the real movie state and, if it has
 * a usable video URL, resets the run to "ready" so the next cron tick (or the
 * UI poll) uploads it to TikTok.
 *
 * Safe to call repeatedly — if Popcorn still doesn't have a URL, the run
 * stays failed and the response explains why.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: channelId, runId } = await params;

  const run = await prisma.channelRun.findFirst({
    where: { id: runId, channelId, userId: session.user.id },
    select: { id: true, status: true, popcornMovieId: true },
  });
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  if (!run.popcornMovieId) {
    return NextResponse.json(
      { error: "Run has no Popcorn movie id to rescue from." },
      { status: 400 }
    );
  }

  try {
    const movie = await getMovie(run.popcornMovieId);
    const norm = normalizeStatus(movie.status);
    if (norm !== "ready" || !movie.videoUrl) {
      return NextResponse.json(
        {
          ok: false,
          parsedStatus: movie.status,
          normalizedStatus: norm,
          videoUrl: movie.videoUrl,
          message:
            norm === "failed"
              ? `Popcorn movie itself failed: ${movie.errorMessage ?? movie.status}`
              : `Popcorn movie is not ready yet (${movie.status}).`,
        },
        { status: 409 }
      );
    }
    const updated = await prisma.channelRun.update({
      where: { id: run.id },
      data: {
        status: "ready",
        videoUrl: movie.videoUrl,
        errorMessage: null,
      },
      select: { id: true, status: true, videoUrl: true },
    });
    return NextResponse.json({ ok: true, run: updated });
  } catch (err) {
    const message =
      err instanceof PopcornError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Popcorn check failed";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
