import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getMovie, normalizeStatus, PopcornError } from "@/lib/popcorn/client";
import {
  loadConnectionById,
  initDraftUpload,
  TikTokApiError,
} from "@/lib/platform/tiktok-client";

/**
 * GET = poll-and-advance for a ChannelRun.
 *
 * State machine:
 *   generating  → Popcorn working; advance when normalizeStatus = "ready"
 *   ready       → video URL captured; immediately attempt TikTok post
 *   posting     → transient (rarely persists; we move to posted/failed in one go)
 *   posted      → terminal success
 *   failed      → terminal error (Popcorn or TikTok)
 *
 * Idempotent: calling this when the run is terminal (posted/failed) just
 * returns the current state without changing anything.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: channelId, runId } = await params;

  let run = await prisma.channelRun.findFirst({
    where: { id: runId, channelId, userId: session.user.id },
    include: {
      channel: {
        select: {
          connectionId: true,
          connection: { select: { platform: true, accountHandle: true } },
        },
      },
    },
  });
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  // Terminal — return as-is.
  if (run.status === "posted" || run.status === "failed") {
    return NextResponse.json({ run: stripJoin(run) });
  }

  // Hard timeout: if a non-terminal run has been alive longer than the cap,
  // mark it as failed. Real-world Popcorn renders for this account land
  // between 17 and 35 minutes (occasionally longer), so 60 minutes gives
  // plenty of headroom while still killing genuinely stuck jobs.
  const RUN_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes
  const elapsedMs = Date.now() - new Date(run.createdAt).getTime();
  if (elapsedMs > RUN_TIMEOUT_MS) {
    run = await prisma.channelRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        errorMessage: `Run timed out after ${Math.round(
          elapsedMs / 60000
        )} minutes. Popcorn never reported a usable video URL.`,
      },
      include: {
        channel: {
          select: {
            connectionId: true,
            connection: { select: { platform: true, accountHandle: true } },
          },
        },
      },
    });
    return NextResponse.json({ run: stripJoin(run) });
  }

  // 1. If we're still waiting on Popcorn, poll it.
  if (run.status === "generating" && run.popcornMovieId) {
    try {
      const movie = await getMovie(run.popcornMovieId);
      const norm = normalizeStatus(movie.status);
      if (norm === "failed") {
        run = await prisma.channelRun.update({
          where: { id: run.id },
          data: {
            status: "failed",
            errorMessage: movie.errorMessage ?? `Popcorn returned ${movie.status}`,
          },
          include: {
            channel: {
              select: {
                connectionId: true,
                connection: { select: { platform: true, accountHandle: true } },
              },
            },
          },
        });
        return NextResponse.json({ run: stripJoin(run) });
      }
      if (norm === "ready" && movie.videoUrl) {
        run = await prisma.channelRun.update({
          where: { id: run.id },
          data: { status: "ready", videoUrl: movie.videoUrl },
          include: {
            channel: {
              select: {
                connectionId: true,
                connection: { select: { platform: true, accountHandle: true } },
              },
            },
          },
        });
        // Fall through to step 2 immediately so we don't waste a poll cycle.
      } else if (norm === "ready" && !movie.videoUrl) {
        // Popcorn says ready but our parser couldn't find a video URL. Don't
        // mark the run as failed yet — Popcorn sometimes flips ready before
        // the final asset URL is exposed. Return with a clear hint so the UI
        // shows what's going on; the next poll re-checks.
        return NextResponse.json({
          run: stripJoin(run),
          popcornStatus: movie.status,
          popcornHint:
            "Popcorn reports ready but no video URL is in the response yet. Retrying…",
        });
      } else {
        // Still generating, return current with popcornStatus for the UI.
        return NextResponse.json({
          run: stripJoin(run),
          popcornStatus: movie.status,
        });
      }
    } catch (err) {
      if (err instanceof PopcornError) {
        // Transient Popcorn errors don't kill the run yet — surface them but
        // leave status=generating so the next poll retries.
        return NextResponse.json({
          run: stripJoin(run),
          popcornError: err.message,
        });
      }
      throw err;
    }
  }

  // 2. If we have a video URL and haven't posted yet, post to TikTok now.
  if (run.status === "ready" && run.videoUrl) {
    // Load the EXACT connection the channel targets — not the user's currently
    // cookie-selected TikTok account. This is critical when the user has
    // multiple TikTok accounts connected.
    const conn = await loadConnectionById(
      run.channel.connectionId,
      session.user.id
    );
    if (!conn) {
      run = await prisma.channelRun.update({
        where: { id: run.id },
        data: {
          status: "failed",
          errorMessage:
            "TikTok connection no longer active. Reconnect it and re-run the channel.",
        },
        include: {
          channel: {
            select: {
              connectionId: true,
              connection: { select: { platform: true, accountHandle: true } },
            },
          },
        },
      });
      return NextResponse.json({ run: stripJoin(run) });
    }

    try {
      const result = await initDraftUpload(conn, { videoUrl: run.videoUrl });

      // Also write a PostHistory row so the video shows up in /tiktok history
      // alongside drafts sent from the composer.
      await prisma.postHistory.create({
        data: {
          userId: session.user.id,
          workspaceId: (
            await prisma.channel.findUnique({
              where: { id: channelId },
              select: { workspaceId: true },
            })
          )?.workspaceId as string,
          platform: "tiktok",
          postType: "original",
          content: run.promptUsed,
          videoUrl: run.videoUrl,
          videoFormat: "mp4",
          platformPostId: result.publishId,
          postingMethod: "tiktok_api",
        },
      });

      run = await prisma.channelRun.update({
        where: { id: run.id },
        data: { status: "posted", platformPostId: result.publishId },
        include: {
          channel: {
            select: {
              connectionId: true,
              connection: { select: { platform: true, accountHandle: true } },
            },
          },
        },
      });
      return NextResponse.json({ run: stripJoin(run) });
    } catch (err) {
      const message =
        err instanceof TikTokApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "TikTok post failed";
      run = await prisma.channelRun.update({
        where: { id: run.id },
        data: { status: "failed", errorMessage: message },
        include: {
          channel: {
            select: {
              connectionId: true,
              connection: { select: { platform: true, accountHandle: true } },
            },
          },
        },
      });
      return NextResponse.json({ run: stripJoin(run) });
    }
  }

  return NextResponse.json({ run: stripJoin(run) });
}

// Strip the joined channel info before returning to the client (keep payload
// small; the UI only needs the run fields).
function stripJoin(run: {
  id: string;
  channelId: string;
  status: string;
  promptUsed: string;
  popcornMovieId: string | null;
  videoUrl: string | null;
  platformPostId: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: run.id,
    channelId: run.channelId,
    status: run.status,
    promptUsed: run.promptUsed,
    popcornMovieId: run.popcornMovieId,
    videoUrl: run.videoUrl,
    platformPostId: run.platformPostId,
    errorMessage: run.errorMessage,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  };
}
