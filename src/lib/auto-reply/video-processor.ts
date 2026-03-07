import { prisma } from "@/lib/prisma";
import { createMovie, getMovieStatus, getMovieUrl } from "@/lib/video/popcorn";
import { generateContent } from "@/lib/content/generator";
import { postTweetWithRetry, XPostError } from "@/lib/platform/x-client";

export interface VideoProcessResult {
  kicked: number;
  ready: number;
  posted: number;
  failed: number;
  stillProcessing: number;
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
        userId: log.userId,
      });

      // Store movieRootId and caption, move to "generating_video" status
      await prisma.autoReplyLog.update({
        where: { id: log.id },
        data: {
          movieRootId: movie.movieRootId,
          replyContent: caption,
          status: "generating_video",
        },
      });

      result.kicked++;
      console.log(
        `[VideoProcessor] Kicked off video for log ${log.id}: movieRootId=${movie.movieRootId}`
      );
    } catch (err) {
      await prisma.autoReplyLog.update({
        where: { id: log.id },
        data: { status: "failed" },
      });
      const msg = err instanceof Error ? err.message : "Unknown error";
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
      // Check if this job has been stuck for too long (>25 minutes)
      const ageMs = Date.now() - new Date(log.createdAt).getTime();
      const maxAgeMs = 25 * 60 * 1000;
      if (ageMs > maxAgeMs) {
        await prisma.autoReplyLog.update({
          where: { id: log.id },
          data: { status: "failed" },
        });
        result.failed++;
        result.errors.push(
          `Log ${log.id}: Video generation timed out after ${Math.round(ageMs / 60000)} minutes`
        );
        console.error(
          `[VideoProcessor] Video timed out for log ${log.id} (${Math.round(ageMs / 60000)}m)`
        );
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

      if (!videoUrl) {
        throw new Error("Video marked as ready but no URL returned");
      }

      result.ready++;
      console.log(
        `[VideoProcessor] Video ready for log ${log.id}: ${videoUrl}`
      );

      // Post or save for approval based on reply mode
      const replyMode = log.watchedAccount.replyMode;

      if (replyMode === "auto") {
        try {
          const tweetText = log.replyContent || ".";

          const posted = await postTweetWithRetry(
            log.userId,
            tweetText,
            log.targetTweetId,
            videoUrl
          );

          await prisma.autoReplyLog.update({
            where: { id: log.id },
            data: {
              videoUrl,
              replyTweetId: posted.id,
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
              videoUrl,
              videoFormat: "mp4",
              platformPostId: posted.id,
            },
          });

          result.posted++;
          console.log(
            `[VideoProcessor] Video reply posted for log ${log.id}: tweet ${posted.id}`
          );
        } catch (postErr) {
          const isRetryable =
            postErr instanceof XPostError &&
            (postErr.isAuthError ||
              postErr.isRateLimit ||
              postErr.isTokenExpired);

          // Save the video URL even if posting fails so we don't regenerate
          await prisma.autoReplyLog.update({
            where: { id: log.id },
            data: {
              videoUrl,
              status: isRetryable ? "pending" : "failed",
            },
          });

          const msg =
            postErr instanceof Error ? postErr.message : "Unknown post error";
          result.errors.push(`Log ${log.id} (post): ${msg}`);
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
      await prisma.autoReplyLog.update({
        where: { id: log.id },
        data: { status: "failed" },
      });
      const msg = err instanceof Error ? err.message : "Unknown error";
      result.errors.push(`Log ${log.id} (check): ${msg}`);
      result.failed++;
      console.error(
        `[VideoProcessor] Failed to check status for log ${log.id}:`,
        err
      );
    }
  }

  return result;
}
