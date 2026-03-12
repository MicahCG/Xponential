import { prisma } from "@/lib/prisma";
import { createMovie, getMovieStatus, getMovieUrl, triggerWatermarkedVideo } from "@/lib/video/popcorn";
import { startTweetViaApify, checkApifyRun } from "@/lib/platform/apify-poster";
import { compressVideo } from "@/lib/video/compress";
import { getVideoSettings } from "@/lib/video/settings";

export async function processVideoPosts() {
  const result = { kicked: 0, ready: 0, posting: 0, posted: 0, failed: 0, stillProcessing: 0, errors: [] as string[] };

  // ── Phase 1: Kick off Popcorn generation for new pending posts ──
  const newPosts = await prisma.videoPost.findMany({
    where: { status: "pending", movieRootId: null },
    orderBy: { createdAt: "asc" },
    take: 3,
  });

  for (const post of newPosts) {
    try {
      const videoSettings = await getVideoSettings(post.userId);
      if (!videoSettings.popcornUserId) throw new Error("No Popcorn User ID configured.");

      const movie = await createMovie({
        prompt: post.videoPrompt,
        duration: videoSettings.duration,
        orientation: videoSettings.orientation,
        quality: videoSettings.quality,
        style: videoSettings.style,
        userId: videoSettings.popcornUserId,
      });

      await prisma.videoPost.update({
        where: { id: post.id },
        data: { movieRootId: movie.movieRootId, status: "generating_video", generationStartedAt: new Date() },
      });

      result.kicked++;
      console.log(`[VideoPostProcessor] Kicked off video for post ${post.id}: movieRootId=${movie.movieRootId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      await prisma.videoPost.update({ where: { id: post.id }, data: { status: "failed", errorMessage: msg } });
      result.errors.push(`Post ${post.id}: ${msg}`);
      result.failed++;
    }
  }

  // ── Phase 2: Check Popcorn status and fire Apify when ready ──
  const generatingPosts = await prisma.videoPost.findMany({
    where: { status: "generating_video", movieRootId: { not: null } },
    orderBy: { createdAt: "asc" },
    take: 10,
  });

  for (const post of generatingPosts) {
    try {
      const ageMs = Date.now() - new Date(post.generationStartedAt ?? post.createdAt).getTime();
      if (ageMs > 45 * 60 * 1000) {
        await prisma.videoPost.update({ where: { id: post.id }, data: { status: "failed", errorMessage: "Video generation timed out" } });
        result.failed++;
        continue;
      }

      const status = await getMovieStatus(post.movieRootId!);
      if (status.status !== "ready") { result.stillProcessing++; continue; }

      const movieUrl = await getMovieUrl(post.movieRootId!);
      if (!movieUrl.watermarkedVideoUrl) {
        await triggerWatermarkedVideo(post.movieRootId!);
        result.stillProcessing++;
        continue;
      }

      result.ready++;
      const compressedUrl = await compressVideo(movieUrl.watermarkedVideoUrl);
      const { runId } = await startTweetViaApify(post.userId, post.tweetText, undefined, compressedUrl);

      await prisma.videoPost.update({
        where: { id: post.id },
        data: { videoUrl: movieUrl.watermarkedVideoUrl, apifyRunId: runId, status: "posting" },
      });

      result.posting++;
      console.log(`[VideoPostProcessor] Post ${post.id} started via Apify: runId=${runId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      await prisma.videoPost.update({ where: { id: post.id }, data: { status: "failed", errorMessage: msg } });
      result.errors.push(`Post ${post.id}: ${msg}`);
      result.failed++;
    }
  }

  // ── Phase 3: Check Apify results for posting posts ──
  const postingPosts = await prisma.videoPost.findMany({
    where: { status: "posting", apifyRunId: { not: null } },
    orderBy: { createdAt: "asc" },
    take: 10,
  });

  for (const post of postingPosts) {
    try {
      const ageMs = Date.now() - new Date(post.generationStartedAt ?? post.createdAt).getTime();
      if (ageMs > 45 * 60 * 1000) {
        await prisma.videoPost.update({ where: { id: post.id }, data: { status: "failed", errorMessage: "Posting timed out" } });
        result.failed++;
        continue;
      }

      const check = await checkApifyRun(post.apifyRunId!);
      if (check.status === "running") { result.stillProcessing++; continue; }

      if (check.status === "failed") {
        await prisma.videoPost.update({ where: { id: post.id }, data: { status: "failed", errorMessage: check.errorMessage ?? "Apify run failed" } });
        result.failed++;
        continue;
      }

      await prisma.videoPost.update({
        where: { id: post.id },
        data: { platformPostId: check.tweetId, status: "posted", postedAt: new Date() },
      });

      await prisma.postHistory.create({
        data: {
          userId: post.userId,
          platform: "x",
          postType: "original",
          content: post.tweetText,
          videoUrl: post.videoUrl ?? undefined,
          videoFormat: "mp4",
          platformPostId: check.tweetId,
        },
      });

      result.posted++;
      console.log(`[VideoPostProcessor] Post ${post.id} posted: tweetId=${check.tweetId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      await prisma.videoPost.update({ where: { id: post.id }, data: { status: "failed", errorMessage: msg } });
      result.errors.push(`Post ${post.id}: ${msg}`);
      result.failed++;
    }
  }

  return result;
}
