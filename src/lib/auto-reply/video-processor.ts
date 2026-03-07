import { prisma } from "@/lib/prisma";
import { createMovie, waitForMovie } from "@/lib/video/popcorn";
import { generateContent } from "@/lib/content/generator";
import { postTweetWithRetry, XPostError } from "@/lib/platform/x-client";

export interface VideoProcessResult {
  processed: number;
  posted: number;
  failed: number;
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
 * Processes all pending video reply logs:
 * 1. Generates a short caption via AI
 * 2. Creates a video via Popcorn
 * 3. Waits for the video to be ready
 * 4. Posts the reply (caption + video) via Apify
 *
 * Processes one log at a time to avoid overwhelming the video API.
 */
export async function processVideoReplies(): Promise<VideoProcessResult> {
  const result: VideoProcessResult = {
    processed: 0,
    posted: 0,
    failed: 0,
    errors: [],
  };

  // Find all pending video reply logs that haven't been processed yet.
  // videoUrl is null means the video hasn't been generated yet.
  const pendingLogs = await prisma.autoReplyLog.findMany({
    where: {
      replyType: "video",
      status: "pending",
      videoUrl: null,
    },
    include: {
      watchedAccount: true,
    },
    orderBy: { createdAt: "asc" },
    take: 5, // Process up to 5 at a time to limit resource usage
  });

  if (pendingLogs.length === 0) {
    return result;
  }

  console.log(
    `[VideoProcessor] Found ${pendingLogs.length} pending video replies to process`
  );

  for (const log of pendingLogs) {
    result.processed++;

    try {
      // Mark as processing to prevent duplicate processing
      await prisma.autoReplyLog.update({
        where: { id: log.id },
        data: { status: "processing" },
      });

      // Step 1: Generate a short caption for the video reply
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
          `[VideoProcessor] Caption generation failed for log ${log.id}, using fallback:`,
          genErr
        );
        // Continue without a caption — the video is the main content
      }

      // Step 2: Create the video via Popcorn
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

      // Step 3: Wait for the video to be ready (up to 5 minutes)
      const movieResult = await waitForMovie(movie.movieRootId, {
        maxWaitMs: 5 * 60 * 1000,
      });

      const videoUrl = movieResult.videoUrl ?? movieResult.watermarkedVideoUrl;
      if (!videoUrl) {
        throw new Error("Video generation completed but no video URL returned");
      }

      console.log(
        `[VideoProcessor] Video ready for log ${log.id}: ${videoUrl}`
      );

      // Step 4: Post the reply with video
      const replyMode = log.watchedAccount.replyMode;

      if (replyMode === "auto") {
        // Auto mode: post immediately
        try {
          // Use caption if we have one, otherwise use a minimal text
          const tweetText = caption || ".";

          const posted = await postTweetWithRetry(
            log.userId,
            tweetText,
            log.targetTweetId,
            videoUrl
          );

          await prisma.autoReplyLog.update({
            where: { id: log.id },
            data: {
              replyContent: caption,
              videoUrl,
              replyTweetId: posted.id,
              status: "posted",
              postedAt: new Date(),
            },
          });

          // Also record in post history
          await prisma.postHistory.create({
            data: {
              userId: log.userId,
              platform: "x",
              postType: "reply",
              content: caption,
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

          await prisma.autoReplyLog.update({
            where: { id: log.id },
            data: {
              replyContent: caption,
              videoUrl,
              status: isRetryable ? "pending" : "failed",
            },
          });

          const msg =
            postErr instanceof Error ? postErr.message : "Unknown post error";
          result.errors.push(`Log ${log.id}: Post failed - ${msg}`);
          result.failed++;
        }
      } else {
        // Manual mode: save as ready for user approval
        await prisma.autoReplyLog.update({
          where: { id: log.id },
          data: {
            replyContent: caption,
            videoUrl,
            status: "pending",
          },
        });
        console.log(
          `[VideoProcessor] Video ready for manual approval: log ${log.id}`
        );
      }
    } catch (err) {
      // Mark as failed
      await prisma.autoReplyLog.update({
        where: { id: log.id },
        data: { status: "failed" },
      });

      const msg = err instanceof Error ? err.message : "Unknown error";
      result.errors.push(`Log ${log.id}: ${msg}`);
      result.failed++;
      console.error(`[VideoProcessor] Failed to process log ${log.id}:`, err);
    }
  }

  return result;
}
