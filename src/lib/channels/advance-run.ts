import { prisma } from "@/lib/prisma";
import { getMovie, normalizeStatus, PopcornError } from "@/lib/popcorn/client";
import {
  loadConnectionById,
  initDraftUpload,
  checkPublishVerdict,
  TikTokApiError,
} from "@/lib/platform/tiktok-client";

/**
 * Per-stage deadlines, measured from run.createdAt.
 *
 * - GENERATING: Popcorn renders normally finish in 17-50 minutes for this
 *   workspace. 90 min is generous headroom; past that, the movie is almost
 *   certainly stuck on Popcorn's side (we've seen "running, concept" hang
 *   for 6+ hours with no progress).
 *
 * - UPLOADED: TikTok's PROCESSING_UPLOAD can sit on the same `uploaded_bytes`
 *   for 15-30+ minutes after a successful PUT. We've observed multi-hour
 *   stalls in prod. 4h gives TikTok enough room to finally flip without us
 *   prematurely failing runs whose bytes are already safely on TikTok.
 *
 * - READY: shouldn't linger here — it just means we have a video URL but
 *   haven't kicked off the TikTok init yet. 90 min matches GENERATING since
 *   any time spent here came out of the same budget.
 */
const GENERATING_DEADLINE_MS = 90 * 60 * 1000;
const READY_DEADLINE_MS = 90 * 60 * 1000;
const UPLOADED_DEADLINE_MS = 4 * 60 * 60 * 1000;

function deadlineForStatus(status: string): number {
  if (status === "uploaded") return UPLOADED_DEADLINE_MS;
  if (status === "ready") return READY_DEADLINE_MS;
  return GENERATING_DEADLINE_MS;
}

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
  tiktokStatus?: string;
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

  // Hard timeout. Forensics on the first wave of failures showed the old
  // behaviour was outright wrong: it always blamed Popcorn ("Popcorn never
  // reported a usable video URL"), even when Popcorn had finished, the bytes
  // were on TikTok, and we already had a platformPostId. The real bottleneck
  // was TikTok sitting on PROCESSING_UPLOAD for 20+ minutes — sometimes hours.
  //
  // The new behaviour is state-aware in two ways:
  //   1. The deadline itself varies by current status (uploaded runs get up
  //      to 4h because TikTok's CDN can take that long; generating gets 90m).
  //   2. At timeout, one last appropriate attempt for whatever stage we're
  //      stuck in, and only fail with a message reflecting the actual blocker.
  const elapsedMs = Date.now() - new Date(run.createdAt).getTime();
  const deadline = deadlineForStatus(run.status);
  if (elapsedMs > deadline) {
    const minutes = Math.round(elapsedMs / 60000);

    // (a) Stuck in "generating" — Popcorn poll never landed a usable URL.
    if (run.status === "generating") {
      if (!run.popcornMovieId) {
        run = await prisma.channelRun.update({
          where: { id: run.id },
          data: {
            status: "failed",
            errorMessage: `Run timed out after ${minutes} minutes without a Popcorn movie id.`,
          },
          include: runInclude,
        });
        return { run: strip(run) };
      }
      try {
        const movie = await getMovie(run.popcornMovieId);
        const norm = normalizeStatus(movie.status);
        if (norm === "ready" && movie.videoUrl) {
          run = await prisma.channelRun.update({
            where: { id: run.id },
            data: { status: "ready", videoUrl: movie.videoUrl, errorMessage: null },
            include: runInclude,
          });
          // fall through to step 2 — try the TikTok upload right away.
        } else {
          const reason =
            norm === "failed"
              ? movie.errorMessage ?? `Popcorn reports ${movie.status}`
              : `Popcorn last status: ${movie.status}${
                  movie.errorMessage ? ` — ${movie.errorMessage}` : ""
                }`;
          run = await prisma.channelRun.update({
            where: { id: run.id },
            data: {
              status: "failed",
              errorMessage: `Run timed out after ${minutes} minutes waiting on Popcorn. ${reason}`,
            },
            include: runInclude,
          });
          return { run: strip(run) };
        }
      } catch (err) {
        const detail = err instanceof Error ? err.message : "unknown";
        run = await prisma.channelRun.update({
          where: { id: run.id },
          data: {
            status: "failed",
            errorMessage: `Run timed out after ${minutes} minutes waiting on Popcorn. Final Popcorn check also failed: ${detail}`,
          },
          include: runInclude,
        });
        return { run: strip(run) };
      }
    }

    // (b) Stuck in "uploaded" — bytes are on TikTok, TikTok's CDN never
    // confirmed publish. This is the common case observed in production:
    // status/fetch returns PROCESSING_UPLOAD for 15-30+ minutes. Do one final
    // verdict check; mark failed only if TikTok still hasn't moved.
    if (run.status === "uploaded" && run.platformPostId) {
      const conn = await loadConnectionById(
        run.channel.connectionId,
        run.userId
      );
      if (!conn) {
        run = await prisma.channelRun.update({
          where: { id: run.id },
          data: {
            status: "failed",
            errorMessage: `Run timed out after ${minutes} minutes — TikTok connection went inactive before TikTok confirmed the upload.`,
          },
          include: runInclude,
        });
        return { run: strip(run) };
      }
      try {
        const result = await checkPublishVerdict(conn, run.platformPostId, 0);
        run = await applyTikTokVerdict(
          run.id,
          run.channel.workspaceId,
          run.userId,
          run.promptUsed,
          run.videoUrl ?? "",
          result
        );
        if (run.status !== "posted" && run.status !== "failed") {
          // Still processing on TikTok's side after the wall-clock budget.
          // applyTikTokVerdict put us back in "uploaded" with the latest
          // status; overwrite that with a final failure that tells the truth.
          run = await prisma.channelRun.update({
            where: { id: run.id },
            data: {
              status: "failed",
              errorMessage: `Run timed out after ${minutes} minutes. TikTok accepted the upload but never confirmed publish (last status: ${result.lastStatus}). The bytes are on TikTok; check the TikTok app inbox in case it eventually arrived.`,
            },
            include: runInclude,
          });
        }
        return { run: strip(run) };
      } catch (err) {
        const detail = err instanceof Error ? err.message : "unknown";
        run = await prisma.channelRun.update({
          where: { id: run.id },
          data: {
            status: "failed",
            errorMessage: `Run timed out after ${minutes} minutes. Final TikTok status check also failed: ${detail}`,
          },
          include: runInclude,
        });
        return { run: strip(run) };
      }
    }

    // (c) Stuck in "ready" or some other non-terminal state — fall through
    // so the regular advance steps below get one more shot. If they don't
    // reach terminal, we'll hit step (d) at the bottom of this function.
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
          data: { status: "ready", videoUrl: movie.videoUrl, errorMessage: null },
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
        // Persist the transport-level error onto the run so the next tick (and
        // the eventual timeout branch) can see we've been failing to *reach*
        // Popcorn, not that Popcorn says we're stuck. Status stays "generating"
        // so the cron keeps retrying — only the message changes.
        await prisma.channelRun.update({
          where: { id: run.id },
          data: { errorMessage: `Popcorn check failed: ${err.message} (will retry)` },
        });
        return { run: strip(run), popcornError: err.message };
      }
      throw err;
    }
  }

  // 2. We have a video URL — upload it to TikTok as a draft. After upload,
  // we only mark "posted" when TikTok explicitly confirms SEND_TO_USER_INBOX.
  // If TikTok is still processing, we park in "uploaded" and let the cron
  // continue polling status/fetch until we get a real verdict.
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
      run = await applyTikTokVerdict(run.id, run.channel.workspaceId, run.userId, run.promptUsed, run.videoUrl, result);
      return { run: strip(run), tiktokStatus: result.lastStatus };
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

  // 3. Uploaded to TikTok, awaiting their async verdict — re-check status.
  if (run.status === "uploaded" && run.platformPostId) {
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
            "TikTok connection no longer active before we could confirm the upload.",
        },
        include: runInclude,
      });
      return { run: strip(run) };
    }

    try {
      // Single-shot check on this tick — the cron will revisit next cycle if
      // TikTok is still processing.
      const result = await checkPublishVerdict(conn, run.platformPostId, 0);
      run = await applyTikTokVerdict(
        run.id,
        run.channel.workspaceId,
        run.userId,
        run.promptUsed,
        run.videoUrl ?? "",
        result
      );
      return { run: strip(run), tiktokStatus: result.lastStatus };
    } catch (err) {
      // Status-fetch errors are transient — stay in "uploaded" and let the
      // next cron tick try again.
      const message = err instanceof Error ? err.message : "status check failed";
      console.warn("[advance-run] tiktok status check error:", message);
      return { run: strip(run), tiktokStatus: "STATUS_FETCH_ERROR" };
    }
  }

  // (d) Final timeout guard — if we've blown the per-stage budget for the
  // status the run *currently* sits in, and the attempts above didn't push
  // us to a terminal state, fail with a message that names the stage we
  // couldn't get past. Re-evaluating the deadline against `run.status` (not
  // the value at function entry) matters: a run that started as "generating"
  // and flipped to "uploaded" during this tick should get the longer TikTok
  // deadline, not the Popcorn one.
  const finalDeadline = deadlineForStatus(run.status);
  const finalElapsed = Date.now() - new Date(run.createdAt).getTime();
  if (finalElapsed > finalDeadline && run.status !== "posted" && run.status !== "failed") {
    const minutes = Math.round(finalElapsed / 60000);
    const stageMsg =
      run.status === "ready"
        ? `couldn't start the TikTok upload (run is "ready" with a video URL but the upload step never ran to terminal).`
        : run.status === "uploaded"
          ? `TikTok accepted the upload but never confirmed publish. The bytes are on TikTok; check the TikTok app inbox.`
          : `still in state "${run.status}".`;
    run = await prisma.channelRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        errorMessage: `Run timed out after ${minutes} minutes — ${stageMsg}`,
      },
      include: runInclude,
    });
  }

  return { run: strip(run) };
}

interface TikTokVerdict {
  publishId: string;
  verdict: "delivered" | "processing" | "failed";
  lastStatus: string;
  failReason?: string;
}

/**
 * Maps a TikTok verdict onto the ChannelRun state machine. Centralized so the
 * "first upload" and "cron re-check" paths agree on the same transitions.
 */
async function applyTikTokVerdict(
  runId: string,
  workspaceId: string,
  userId: string,
  promptUsed: string,
  videoUrl: string,
  result: TikTokVerdict
) {
  if (result.verdict === "failed") {
    return prisma.channelRun.update({
      where: { id: runId },
      data: {
        status: "failed",
        platformPostId: result.publishId,
        errorMessage: `TikTok rejected the upload — ${result.lastStatus}${
          result.failReason ? `: ${result.failReason}` : ""
        }`,
      },
      include: runInclude,
    });
  }

  if (result.verdict === "delivered") {
    // Idempotent: only write PostHistory the first time this run flips to
    // posted (on retry/re-check it would already exist).
    const existing = await prisma.postHistory.findFirst({
      where: { platformPostId: result.publishId, platform: "tiktok" },
      select: { id: true },
    });
    if (!existing) {
      await prisma.postHistory.create({
        data: {
          userId,
          workspaceId,
          platform: "tiktok",
          postType: "original",
          content: promptUsed,
          videoUrl,
          videoFormat: "mp4",
          platformPostId: result.publishId,
          postingMethod: "tiktok_api",
        },
      });
    }
    return prisma.channelRun.update({
      where: { id: runId },
      data: {
        status: "posted",
        platformPostId: result.publishId,
        errorMessage: null,
      },
      include: runInclude,
    });
  }

  // Still processing on TikTok's side — park in "uploaded" with the publish_id
  // so the cron can keep checking and the UI can show the live TikTok status.
  return prisma.channelRun.update({
    where: { id: runId },
    data: {
      status: "uploaded",
      platformPostId: result.publishId,
      errorMessage: `Awaiting TikTok confirmation (last status: ${result.lastStatus})`,
    },
    include: runInclude,
  });
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
