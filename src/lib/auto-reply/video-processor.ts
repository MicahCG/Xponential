import { prisma } from "@/lib/prisma";
import { createMovie, getMovieStatus, getMovieUrl } from "@/lib/video/popcorn";
import { generateContent } from "@/lib/content/generator";
import { startTweetViaApify, checkApifyRun } from "@/lib/platform/apify-poster";

export interface VideoProcessResult {
  kicked: number;
  ready: number;
  posted: number;
  failed: number;
  stillProcessing: number;
  posting: number;
  errors: string[];
}

/**
 * Builds a Popcorn video prompt based on the tweet being replied to.
 * The prompt drives the visual content of the generated video.
 */
function buildVideoPrompt(targetAuthor: string, targetTweetId: string): string {
  return `Create a video based off this tweet https://x.com/${targetAuthor}/status/${targetTweetId}`;
}

/**
 * Looks up the user's Popcorn account ID from their settings.
 * This is the userId sent to the Popcorn createMovie API.
 */
async function getPopcornUserId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { settings: true },
  });
  const settings = (user?.settings ?? {}) as Record<string, unknown>;
  return (settings.popcornUserId as string) ?? null;
}

/**
 * Two-phase video reply processor designed for serverless environments.
 *
 * Phase 1 — KICK OFF: Find pending video logs that haven't started yet
 *   (videoUrl=null, movieRootId=null). Generate a caption, call Popcorn
 *   createMovie, store the movieRootId, set status to "generating_video".
 *
 * Phase 2 — CHECK STATUS: Find logs with status "generating_video".
 *   Poll Popcorn for each. If ready, grab the URL and post (auto mode)
 *   or save for approval (manual mode). If still processing, skip.
 *   If stuck for >25 minutes, mark as failed.
 *
 * Each phase is fast (single API call per log) so it fits within
 * Vercel's serverless function timeout limits.
 */
export async function processVideoReplies(): Promise<VideoProcessResult> {
  const result: VideoProcessResult = {
    kicked: 0,
    ready: 0,
    posted: 0,
    failed: 0,
    stillProcessing: 0,
    posting: 0,
    errors: [],
  };

  // ── Phase 1: Kick off new video generation jobs ─────────────

  const newLogs = await prisma.autoReplyLog.findMany({
    where: {
      replyType: "video",
      status: "pending",
      videoUrl: null,
      movieRootId: null,
    },
    include: { watchedAccount: true },
    orderBy: { createdAt: "asc" },
    take: 3,
  });

  for (const log of newLogs) {
    try {
      // Generate a short caption for the video reply
      let caption = "";
      try {
        const generated = await generateContent(
          {
            platform: "x",
            postType: "reply",
            targetPostContent: log.targetTweetText,
            targetAuthor: log.targetAuthor,
            count: 1,
          },
          log.userId
        );
        caption = generated[0]?.content ?? "";
      } catch (genErr) {
        console.warn(
          `[VideoProcessor] Caption generation failed for log ${log.id}, continuing without:`,
          genErr
        );
      }

      // Look up the user's Popcorn account ID
      const popcornUserId = await getPopcornUserId(log.userId);
      if (!popcornUserId) {
        throw new Error(
          "No Popcorn User ID configured. Add it in Settings to enable video replies."
        );
      }

      // Kick off video generation
      const videoPrompt = buildVideoPrompt(
        log.targetAuthor,
        log.targetTweetId
      );

      const movie = await createMovie({
        prompt: videoPrompt,
        duration: "15",
        orientation: "vertical",
        quality: "medium",
        userId: popcornUserId,
      });

      // Store movieRootId and caption, move to "generating_video" status
      await prisma.autoReplyLog.update({
        where: { id: log.id },
        data: {
          movieRootId: movie.movieRootId,
          replyContent: caption,
          status: "generating_video",
          generationStartedAt: new Date(),
          errorMessage: null,
        },
      });

      result.kicked++;
      console.log(
        `[VideoProcessor] Kicked off video for log ${log.id}: movieRootId=${movie.movieRootId}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      await prisma.autoReplyLog.update({
        where: { id: log.id },
        data: { status: "failed", errorMessage: msg },
      });
      result.errors.push(`Log ${log.id} (kick off): ${msg}`);
      result.failed++;
      console.error(`[VideoProcessor] Failed to kick off log ${log.id}:`, err);
    }
  }

  // ── Phase 2: Check status of in-progress video jobs ─────────

  const inProgressLogs = await prisma.autoReplyLog.findMany({
    where: {
      replyType: "video",
      status: "generating_video",
      movieRootId: { not: null },
    },
    include: { watchedAccount: true },
    orderBy: { createdAt: "asc" },
    take: 10,
  });

  for (const log of inProgressLogs) {
    try {
      // Check if this job has been stuck for too long (>30 minutes from when Popcorn was called)
      const generationStart = log.generationStartedAt ?? log.createdAt;
      const ageMs = Date.now() - new Date(generationStart).getTime();
      const maxAgeMs = 30 * 60 * 1000;
      if (ageMs > maxAgeMs) {
        const timeoutMsg = `Video generation timed out after ${Math.round(ageMs / 60000)} minutes`;
        await prisma.autoReplyLog.update({
          where: { id: log.id },
          data: { status: "failed", errorMessage: timeoutMsg },
        });
        result.failed++;
        result.errors.push(`Log ${log.id}: ${timeoutMsg}`);
        console.error(`[VideoProcessor] ${timeoutMsg} for log ${log.id}`);
        continue;
      }

      // Poll Popcorn for status
      const status = await getMovieStatus(log.movieRootId!);

      if (status.status !== "ready") {
        result.stillProcessing++;
        console.log(
          `[VideoProcessor] Log ${log.id} still processing (${Math.round(ageMs / 60000)}m elapsed)`
        );
        continue;
      }

      // Video is ready — fetch final URL
      const movieUrl = await getMovieUrl(log.movieRootId!);
      const videoUrl = movieUrl.videoUrl ?? movieUrl.watermarkedVideoUrl;
      // Popcorn returns HLS (.m3u8), not MP4. Use thumbnail as image media
      // so the tweet has a visual frame. Native video requires MP4.
      const thumbnailUrl = movieUrl.thumbnailUrl ?? undefined;

      if (!videoUrl) {
        throw new Error("Video marked as ready but no URL returned");
      }

      result.ready++;
      console.log(
        `[VideoProcessor] Video ready for log ${log.id}: videoUrl=${videoUrl} thumbnailUrl=${thumbnailUrl}`
      );

      // Post or save for approval based on reply mode
      const replyMode = log.watchedAccount.replyMode;

      if (replyMode === "auto") {
        try {
          const tweetText = (log.replyContent || "").slice(0, 280) || ".";

          // Start the Apify run ASYNC — don't block waiting.
          // Pass thumbnailUrl as image media (thumbnail is a direct public PNG).
          // The HLS videoUrl (.m3u8) can't be uploaded to Twitter natively.
          const { runId } = await startTweetViaApify(
            log.userId,
            tweetText,
            log.targetTweetId,
            thumbnailUrl  // image preview of the video
          );

          await prisma.autoReplyLog.update({
            where: { id: log.id },
            data: {
              videoUrl,
              apifyRunId: runId,
              status: "posting_video",
            },
          });

          result.posting++;
          console.log(
            `[VideoProcessor] Video post started for log ${log.id}: apifyRunId=${runId}`
          );
        } catch (postErr) {
          const msg =
            postErr instanceof Error ? postErr.message : "Unknown post error";
          await prisma.autoReplyLog.update({
            where: { id: log.id },
            data: { videoUrl, status: "failed", errorMessage: msg },
          });
          result.errors.push(`Log ${log.id} (start post): ${msg}`);
          result.failed++;
        }
      } else {
        // Manual mode: save video URL, set back to pending for user approval
        await prisma.autoReplyLog.update({
          where: { id: log.id },
          data: {
            videoUrl,
            status: "pending",
          },
        });
        console.log(
          `[VideoProcessor] Video ready for manual approval: log ${log.id}`
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      await prisma.autoReplyLog.update({
        where: { id: log.id },
        data: { status: "failed", errorMessage: msg },
      });
      result.errors.push(`Log ${log.id} (check): ${msg}`);
      result.failed++;
      console.error(
        `[VideoProcessor] Failed to check status for log ${log.id}:`,
        err
      );
    }
  }

  // ── Phase 3: Check Apify run results for "posting_video" logs ──

  const postingLogs = await prisma.autoReplyLog.findMany({
    where: {
      replyType: "video",
      status: "posting_video",
      apifyRunId: { not: null },
    },
    include: { watchedAccount: true },
    orderBy: { createdAt: "asc" },
    take: 10,
  });

  for (const log of postingLogs) {
    try {
      // Timeout: if a run has been "posting_video" for >45 minutes, give up
      const ageMs = Date.now() - new Date(log.generationStartedAt ?? log.createdAt).getTime();
      if (ageMs > 45 * 60 * 1000) {
        const timeoutMsg = `Video posting timed out after ${Math.round(ageMs / 60000)} minutes`;
        await prisma.autoReplyLog.update({
          where: { id: log.id },
          data: { status: "failed", errorMessage: timeoutMsg },
        });
        result.failed++;
        result.errors.push(`Log ${log.id}: ${timeoutMsg}`);
        continue;
      }

      const check = await checkApifyRun(log.apifyRunId!);

      if (check.status === "running") {
        result.stillProcessing++;
        console.log(`[VideoProcessor] Log ${log.id} still posting via Apify (runId=${log.apifyRunId})`);
        continue;
      }

      if (check.status === "failed") {
        const msg = check.errorMessage ?? "Apify run failed";
        await prisma.autoReplyLog.update({
          where: { id: log.id },
          data: { status: "failed", errorMessage: msg },
        });
        result.errors.push(`Log ${log.id} (apify): ${msg}`);
        result.failed++;
        console.error(`[VideoProcessor] Apify run failed for log ${log.id}: ${msg}`);
        continue;
      }

      // Succeeded — record the posted tweet
      const tweetId = check.tweetId!;
      await prisma.autoReplyLog.update({
        where: { id: log.id },
        data: {
          replyTweetId: tweetId,
          status: "posted",
          postedAt: new Date(),
        },
      });

      await prisma.postHistory.create({
        data: {
          userId: log.userId,
          platform: "x",
          postType: "reply",
          content: log.replyContent || "",
          targetPostId: log.targetTweetId,
          targetAuthor: log.targetAuthor,
          videoUrl: log.videoUrl ?? undefined,
          videoFormat: "mp4",
          platformPostId: tweetId,
        },
      });

      result.posted++;
      console.log(
        `[VideoProcessor] Video reply posted for log ${log.id}: tweet ${tweetId}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      await prisma.autoReplyLog.update({
        where: { id: log.id },
        data: { status: "failed", errorMessage: msg },
      });
      result.errors.push(`Log ${log.id} (phase3): ${msg}`);
      result.failed++;
      console.error(`[VideoProcessor] Phase 3 error for log ${log.id}:`, err);
    }
  }

  return result;
}
