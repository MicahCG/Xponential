import {
  getUserTimeline,
  getUserProfile,
  getUserProfileFull,
  getUserTimelineWithReplies,
  getUserLikedTweets,
  getUserFollowing,
  getValidAccessToken,
} from "@/lib/platform/x-client";

export interface IngestedProfile {
  profile: {
    bio: string;
    name: string;
    username: string;
    followerCount: number;
    followingCount: number;
  };
  originalTweets: string[];
  replies: { text: string; inReplyToUsername: string }[];
  likedTweets: { text: string; authorUsername: string }[];
  topEngagedAccounts: { username: string; replyCount: number }[];
  following: {
    id: string;
    username: string;
    name: string;
    bio?: string;
    followersCount: number;
  }[];
}

export async function scrapeUserTweets(
  userId: string,
  maxTweets = 100
): Promise<string[]> {
  const accessToken = await getValidAccessToken(userId);

  const profile = await getUserProfile(accessToken);
  const tweets = await getUserTimeline(accessToken, profile.id, maxTweets);

  return tweets.map((t) => t.text);
}

export async function ingestFullProfile(
  userId: string,
  connectionId?: string
): Promise<IngestedProfile> {
  const accessToken = await getValidAccessToken(userId, connectionId);

  // Fetch full profile with bio and metrics
  const profile = await getUserProfileFull(accessToken);

  // Fetch timeline with replies (up to 800 tweets, paginated)
  const allTweets = await getUserTimelineWithReplies(
    accessToken,
    profile.id,
    800
  );

  // Separate original tweets from replies
  const originalTweets: string[] = [];
  const replies: { text: string; inReplyToUsername: string }[] = [];
  const replyCounts = new Map<string, number>();

  for (const tweet of allTweets) {
    if (tweet.isReply && tweet.inReplyToUsername) {
      replies.push({
        text: tweet.text,
        inReplyToUsername: tweet.inReplyToUsername,
      });
      replyCounts.set(
        tweet.inReplyToUsername,
        (replyCounts.get(tweet.inReplyToUsername) ?? 0) + 1
      );
    } else {
      originalTweets.push(tweet.text);
    }
  }

  // Build top engaged accounts from reply counts
  const topEngagedAccounts = Array.from(replyCounts.entries())
    .map(([username, replyCount]) => ({ username, replyCount }))
    .sort((a, b) => b.replyCount - a.replyCount)
    .slice(0, 20);

  // Fetch liked tweets (up to 200)
  let likedTweets: { text: string; authorUsername: string }[] = [];
  try {
    likedTweets = await getUserLikedTweets(accessToken, profile.id, 200);
  } catch (err) {
    console.warn("Could not fetch liked tweets (may need like.read scope):", err);
  }

  // Fetch following list (up to 300)
  let following: IngestedProfile["following"] = [];
  try {
    following = await getUserFollowing(accessToken, profile.id, 300);
  } catch (err) {
    console.warn("Could not fetch following (may need follows.read scope):", err);
  }

  return {
    profile: {
      bio: profile.bio,
      name: profile.name,
      username: profile.username,
      followerCount: profile.followerCount,
      followingCount: profile.followingCount,
    },
    originalTweets,
    replies,
    likedTweets,
    topEngagedAccounts,
    following,
  };
}

export function formatTweetsForAnalysis(tweets: string[]): string {
  return tweets
    .map((tweet, i) => `[${i + 1}] ${tweet}`)
    .join("\n\n");
}

export function formatRepliesForAnalysis(
  replies: { text: string; inReplyToUsername: string }[]
): string {
  return replies
    .map((r, i) => `[${i + 1}] (replying to @${r.inReplyToUsername}) ${r.text}`)
    .join("\n\n");
}

export function formatLikedTweetsForAnalysis(
  likedTweets: { text: string; authorUsername: string }[]
): string {
  return likedTweets
    .map((lt, i) => `[${i + 1}] (by @${lt.authorUsername}) ${lt.text}`)
    .join("\n\n");
}
