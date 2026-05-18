import { prisma } from "@/lib/prisma";
import { getMovie, normalizeStatus, PopcornError } from "@/lib/popcorn/client";
import {
  loadConnectionById,
  initDraftUpload,
  TikTokApiError,
} from "@/lib/platform/tiktok-client";

/**
 * Real-world Popcorn renders for this workspace finish in 17-35 minutes
 * (occasionally longer). 60 minutes gives headroom while still killing
 * genuinely stuck jobs.
 */
const RUN_TIMEOUT_MS = 60 * 60 * 1000;

export interface AdvanceResult {
  run: {
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
  };
  popcornStatus?: string;
  popcornHint?: string;
  popcornError?: string;
}

const runInclude = {
  channel: {
    select: {
      connectionId: true,
      workspaceId: true,
      connection: { select: { platform: true, accountHandle: true } },
    },
  },
} as const;

/**
 * Advances a ChannelRun's state machine by one step:
 *
 *   generating  → ask Popcorn for status; if completed with URL, store URL + flip to "ready"
 *   ready       → fetch video bytes, upload to TikTok as draft, flip to "posted"
 *   posted/failed → no-op
 *
 * Idempotent: safe to call repeatedly. Called from the per-run GET endpoint
 * (when the UI polls) AND from the background cron, so both browser-open and
 * browser-closed workflows make forward progress.
 */
export async function advanceChannelRun(runId: string): Promise<AdvanceResult | null> {
  let run = await prisma.channelRun.findUnique({
    where: { id: runId },
    include: runInclude,
  });
  if (!run) return null;

  if (run.status === "posted" || run.status === "failed") {
    return { run: strip(run) };
  }

  // Hard timeout — kill stuck runs so they don't poll forever.
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
      include: runInclude,
    });
    return { run: strip(run) };
  }

  // 1. Waiting on Popcorn — poll it.
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
          include: runInclude,
        });
        return { run: strip(run) };
      }
      if (norm === "ready" && movie.videoUrl) {
        run = await prisma.channelRun.update({
          where: { id: run.id },
          data: { status: "ready", videoUrl: movie.videoUrl },
          include: runInclude,
        });
        // fall through to step 2 — try the TikTok upload right away.
      } else if (norm === "ready" && !movie.videoUrl) {
        return {
          run: strip(run),
          popcornStatus: movie.status,
          popcornHint:
            "Popcorn reports ready but no video URL is in the response yet. Retrying…",
        };
      } else {
        return { run: strip(run), popcornStatus: movie.status };
      }
    } catch (err) {
      if (err instanceof PopcornError) {
        return { run: strip(run), popcornError: err.message };
      }
      throw err;
    }
  }

  // 2. We have a video URL — upload it to TikTok as a draft.
  if (run.status === "ready" && run.videoUrl) {
    const conn = await loadConnectionById(
      run.channel.connectionId,
      run.userId
    );
    if (!conn) {
      run = await prisma.channelRun.update({
        where: { id: run.id },
        data: {
          status: "failed",
          errorMessage:
            "TikTok connection no longer active. Reconnect it and re-run the channel.",
        },
        include: runInclude,
      });
      return { run: strip(run) };
    }

    try {
      const result = await initDraftUpload(conn, { videoUrl: run.videoUrl });

      await prisma.postHistory.create({
        data: {
          userId: run.userId,
          workspaceId: run.channel.workspaceId,
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
        include: runInclude,
      });
      return { run: strip(run) };
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
        include: runInclude,
      });
      return { run: strip(run) };
    }
  }

  return { run: strip(run) };
}

function strip(run: {
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
