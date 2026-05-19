import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getMovie, normalizeStatus, PopcornError } from "@/lib/popcorn/client";
import {
  loadConnectionById,
  checkPublishVerdict,
  TikTokApiError,
} from "@/lib/platform/tiktok-client";

/**
 * Rescue a ChannelRun that the timeout branch marked "failed" while the
 * downstream systems had actually progressed. Two recovery paths, chosen
 * based on how far the run got:
 *
 * 1. If the run already has a platformPostId → check TikTok status first.
 *    The bytes are already on TikTok; if TikTok has since flipped to
 *    SEND_TO_USER_INBOX, mark the run posted. If still processing, leave it
 *    in "uploaded" so the cron picks back up.
 *
 * 2. Else if the run has a popcornMovieId → check Popcorn. If completed
 *    with a video URL, flip to "ready" and let the cron handle the TikTok
 *    upload.
 *
 * Safe to call repeatedly. Idempotent: never re-uploads if TikTok already
 * has the bytes.
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
    select: {
      id: true,
      status: true,
      popcornMovieId: true,
      platformPostId: true,
      videoUrl: true,
      userId: true,
      channelId: true,
      promptUsed: true,
      channel: {
        select: { connectionId: true, workspaceId: true },
      },
    },
  });
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  // Path 1: bytes are already on TikTok — see if TikTok finally finished.
  if (run.platformPostId) {
    const conn = await loadConnectionById(
      run.channel.connectionId,
      run.userId
    );
    if (!conn) {
      return NextResponse.json(
        {
          ok: false,
          message: "TikTok connection no longer active — reconnect it first.",
        },
        { status: 409 }
      );
    }
    try {
      const verdict = await checkPublishVerdict(conn, run.platformPostId, 0);
      if (verdict.verdict === "delivered") {
        // Mirror applyTikTokVerdict's pattern: findFirst → create only if
        // missing. PostHistory doesn't have a unique constraint on
        // platformPostId so we can't use upsert.
        const existing = await prisma.postHistory.findFirst({
          where: { platformPostId: verdict.publishId, platform: "tiktok" },
          select: { id: true },
        });
        if (!existing) {
          await prisma.postHistory.create({
            data: {
              userId: run.userId,
              workspaceId: run.channel.workspaceId,
              platform: "tiktok",
              postType: "original",
              content: run.promptUsed,
              videoUrl: run.videoUrl ?? "",
              videoFormat: "mp4",
              platformPostId: verdict.publishId,
              postingMethod: "tiktok_api",
            },
          });
        }
        const updated = await prisma.channelRun.update({
          where: { id: run.id },
          data: { status: "posted", errorMessage: null },
          select: { id: true, status: true, platformPostId: true },
        });
        return NextResponse.json({ ok: true, via: "tiktok", run: updated });
      }
      if (verdict.verdict === "failed") {
        const updated = await prisma.channelRun.update({
          where: { id: run.id },
          data: {
            status: "failed",
            errorMessage: `TikTok rejected the upload — ${verdict.lastStatus}${
              verdict.failReason ? `: ${verdict.failReason}` : ""
            }`,
          },
          select: { id: true, status: true, errorMessage: true },
        });
        return NextResponse.json({ ok: false, via: "tiktok", run: updated });
      }
      // Still processing on TikTok. Park back in "uploaded" so cron resumes.
      const updated = await prisma.channelRun.update({
        where: { id: run.id },
        data: {
          status: "uploaded",
          errorMessage: `Re-queued. TikTok last status: ${verdict.lastStatus}`,
        },
        select: { id: true, status: true, errorMessage: true },
      });
      return NextResponse.json({
        ok: true,
        via: "tiktok",
        message: `TikTok still processing (${verdict.lastStatus}). Run is back in the queue.`,
        run: updated,
      });
    } catch (err) {
      const message =
        err instanceof TikTokApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "TikTok status check failed";
      return NextResponse.json({ ok: false, error: message }, { status: 502 });
    }
  }

  // Path 2: never made it to TikTok — check if Popcorn has a usable URL now.
  if (!run.popcornMovieId) {
    return NextResponse.json(
      { error: "Run has neither a TikTok publish id nor a Popcorn movie id." },
      { status: 400 }
    );
  }
  try {
    const movie = await getMovie(run.popcornMovieId);
    const norm = normalizeStatus(movie.status);

    if (norm === "ready" && movie.videoUrl) {
      const updated = await prisma.channelRun.update({
        where: { id: run.id },
        data: { status: "ready", videoUrl: movie.videoUrl, errorMessage: null },
        select: { id: true, status: true, videoUrl: true },
      });
      return NextResponse.json({ ok: true, via: "popcorn", run: updated });
    }

    if (norm === "failed") {
      return NextResponse.json(
        {
          ok: false,
          parsedStatus: movie.status,
          normalizedStatus: norm,
          message: `Popcorn movie itself failed: ${movie.errorMessage ?? movie.status}`,
        },
        { status: 409 }
      );
    }

    // Popcorn is still working (or recovered from a transient interrupt
    // state — we've seen status flip from "failed: interrupted" back to
    // "running" minutes later). Put the run back in the queue so the cron
    // resumes polling; the user doesn't have to babysit it.
    const updated = await prisma.channelRun.update({
      where: { id: run.id },
      data: {
        status: "generating",
        errorMessage: `Re-queued. Popcorn currently reports ${movie.status}${
          movie.errorMessage ? ` — ${movie.errorMessage}` : ""
        }.`,
      },
      select: { id: true, status: true },
    });
    return NextResponse.json({
      ok: true,
      via: "popcorn",
      message: `Popcorn is still working (${movie.status}). Run is back in the queue — the cron will pick it up.`,
      run: updated,
    });
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
