import { prisma } from "@/lib/prisma";
import type { Platform } from "@prisma/client";

export async function getRecentPosts(
  userId: string,
  platform: Platform,
  limit = 20
): Promise<string[]> {
  const posts = await prisma.postHistory.findMany({
    where: { userId, platform },
    orderBy: { postedAt: "desc" },
    take: limit,
    select: { content: true },
  });

  return posts.map((p) => p.content);
}

export async function getPostsToAuthor(
  userId: string,
  targetAuthor: string,
  limit = 10
): Promise<{ content: string; postedAt: Date }[]> {
  return prisma.postHistory.findMany({
    where: { userId, targetAuthor },
    orderBy: { postedAt: "desc" },
    take: limit,
    select: { content: true, postedAt: true },
  });
}

export async function hasRepliedToPost(
  userId: string,
  targetPostId: string
): Promise<boolean> {
  const existing = await prisma.postHistory.findFirst({
    where: { userId, targetPostId },
  });
  return !!existing;
}

export async function getAuthorReplyCountToday(
  userId: string,
  targetAuthor: string
): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  return prisma.postHistory.count({
    where: {
      userId,
      targetAuthor,
      postedAt: { gte: startOfDay },
    },
  });
}

export async function buildMemoryContext(
  userId: string,
  platform: Platform,
  targetAuthor?: string
): Promise<string[]> {
  const recentPosts = await getRecentPosts(userId, platform, 20);

  if (targetAuthor) {
    const authorPosts = await getPostsToAuthor(userId, targetAuthor, 5);
    const authorContents = authorPosts.map((p) => p.content);
    // Merge unique content
    const seen = new Set(recentPosts);
    for (const c of authorContents) {
      if (!seen.has(c)) {
        recentPosts.push(c);
        seen.add(c);
      }
    }
  }

  return recentPosts;
}

export function checkContentSimilarity(
  newContent: string,
  existingPosts: string[],
  threshold = 0.5
): boolean {
  const newWords = new Set(newContent.toLowerCase().split(/\s+/));

  for (const post of existingPosts) {
    const postWords = new Set(post.toLowerCase().split(/\s+/));
    const intersection = [...newWords].filter((w) => postWords.has(w));
    const similarity =
      intersection.length / Math.min(newWords.size, postWords.size);

    if (similarity > threshold) {
      return true; // Too similar
    }
  }

  return false;
}
