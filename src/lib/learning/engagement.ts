import { prisma } from "@/lib/prisma";
import { getValidAccessToken, getTweetMetrics } from "@/lib/platform/x-client";

export interface EngagementPollResult {
  usersProcessed: number;
  postsUpdated: number;
  errors: string[];
}

/**
 * Polls Twitter for engagement metrics on all posts from the last 48h
 * that have a platformPostId. Updates PostHistory.engagement in place.
 */
export async function pollEngagement(): Promise<EngagementPollResult> {
  const result: EngagementPollResult = {
    usersProcessed: 0,
    postsUpdated: 0,
    errors: [],
  };

  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);

  // Find all eligible posts grouped by user
  const posts = await prisma.postHistory.findMany({
    where: {
      platform: "x",
      platformPostId: { not: null },
      postedAt: { gte: cutoff },
    },
    select: {
      id: true,
      userId: true,
      platformPostId: true,
    },
  });

  if (posts.length === 0) return result;

  // Group by userId
  const byUser = new Map<string, typeof posts>();
  for (const post of posts) {
    if (!byUser.has(post.userId)) byUser.set(post.userId, []);
    byUser.get(post.userId)!.push(post);
  }

  for (const [userId, userPosts] of byUser) {
    result.usersProcessed++;

    let accessToken: string;
    try {
      accessToken = await getValidAccessToken(userId);
    } catch (err) {
      result.errors.push(
        `User ${userId}: ${err instanceof Error ? err.message : "Token error"}`
      );
      continue;
    }

    const tweetIds = userPosts.map((p) => p.platformPostId!);

    let metricsMap: Awaited<ReturnType<typeof getTweetMetrics>>;
    try {
      metricsMap = await getTweetMetrics(accessToken, tweetIds);
    } catch (err) {
      result.errors.push(
        `User ${userId} metrics fetch: ${err instanceof Error ? err.message : "Unknown error"}`
      );
      continue;
    }

    const now = new Date();
    await Promise.all(
      userPosts.map(async (post) => {
        const metrics = metricsMap.get(post.platformPostId!);
        if (!metrics) return;

        await prisma.postHistory.update({
          where: { id: post.id },
          data: {
            engagement: {
              likes: metrics.likes,
              retweets: metrics.retweets,
              replies: metrics.replies,
              impressions: metrics.impressions,
              bookmarks: metrics.bookmarks,
              fetchedAt: now.toISOString(),
            },
            metricsUpdatedAt: now,
          },
        });

        result.postsUpdated++;
      })
    );
  }

  return result;
}
