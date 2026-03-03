import { getUserTimeline, getUserProfile } from "@/lib/platform/x-client";
import { prisma } from "@/lib/prisma";

export async function scrapeUserTweets(
  userId: string,
  maxTweets = 100
): Promise<string[]> {
  const connection = await prisma.platformConnection.findUnique({
    where: {
      userId_platform: {
        userId,
        platform: "x",
      },
    },
  });

  if (!connection || connection.status !== "active") {
    throw new Error("X account not connected. Connect your X account first.");
  }

  const profile = await getUserProfile(connection.accessToken);
  const tweets = await getUserTimeline(
    connection.accessToken,
    profile.id,
    maxTweets
  );

  return tweets.map((t) => t.text);
}

export function formatTweetsForAnalysis(tweets: string[]): string {
  return tweets
    .map((tweet, i) => `[${i + 1}] ${tweet}`)
    .join("\n\n");
}
