import { TwitterApi } from "twitter-api-v2";
import { prisma } from "@/lib/prisma";
import { refreshAccessToken } from "@/lib/oauth/x";

export function createXClient(accessToken: string) {
  return new TwitterApi(accessToken);
}

/**
 * Gets a valid access token for a user's X connection.
 * Automatically refreshes if the token is expired or about to expire.
 */
export async function getValidAccessToken(userId: string): Promise<string> {
  const connection = await prisma.platformConnection.findUnique({
    where: {
      userId_platform: { userId, platform: "x" },
    },
  });

  if (!connection || connection.status !== "active") {
    throw new Error("X account not connected. Connect your X account first.");
  }

  // Check if token is expired or expires within 5 minutes
  const bufferMs = 5 * 60 * 1000;
  const isExpired =
    connection.tokenExpires &&
    new Date(connection.tokenExpires).getTime() < Date.now() + bufferMs;

  if (!isExpired) {
    return connection.accessToken;
  }

  // Token is expired — refresh it
  if (!connection.refreshToken) {
    throw new Error(
      "X token expired and no refresh token available. Please reconnect your X account."
    );
  }

  console.log("X token expired, refreshing...");

  const clientId = process.env.X_CLIENT_ID!;
  const clientSecret = process.env.X_CLIENT_SECRET!;

  try {
    const refreshed = await refreshAccessToken({
      refreshToken: connection.refreshToken,
      clientId,
      clientSecret,
    });

    // Update the stored tokens
    await prisma.platformConnection.update({
      where: { id: connection.id },
      data: {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token,
        tokenExpires: new Date(Date.now() + refreshed.expires_in * 1000),
      },
    });

    console.log("X token refreshed successfully");
    return refreshed.access_token;
  } catch (err) {
    console.error("Failed to refresh X token:", err);
    // Mark connection as expired
    await prisma.platformConnection.update({
      where: { id: connection.id },
      data: { status: "expired" },
    });
    throw new Error(
      "Failed to refresh X token. Please reconnect your X account."
    );
  }
}

export async function getUserProfile(accessToken: string) {
  const client = createXClient(accessToken);
  const me = await client.v2.me({
    "user.fields": ["username", "name", "profile_image_url"],
  });
  return {
    id: me.data.id,
    username: me.data.username,
    name: me.data.name,
  };
}

export async function getUserProfileFull(accessToken: string) {
  const client = createXClient(accessToken);
  const me = await client.v2.me({
    "user.fields": [
      "username",
      "name",
      "description",
      "profile_image_url",
      "public_metrics",
    ],
  });
  return {
    id: me.data.id,
    username: me.data.username,
    name: me.data.name,
    bio: me.data.description ?? "",
    followerCount: me.data.public_metrics?.followers_count ?? 0,
    followingCount: me.data.public_metrics?.following_count ?? 0,
    tweetCount: me.data.public_metrics?.tweet_count ?? 0,
  };
}

export async function getUserTimeline(
  accessToken: string,
  userId: string,
  maxResults = 100
) {
  const client = createXClient(accessToken);
  const timeline = await client.v2.userTimeline(userId, {
    max_results: Math.min(maxResults, 100),
    exclude: ["retweets"],
    "tweet.fields": ["created_at", "text", "public_metrics"],
  });

  return timeline.data.data ?? [];
}

/**
 * Fetches user's timeline including replies and paginates for more results.
 * Returns tweets with referenced_tweets info to distinguish replies from originals.
 */
export async function getUserTimelineWithReplies(
  accessToken: string,
  userId: string,
  maxTweets = 200
) {
  const client = createXClient(accessToken);
  const allTweets: {
    text: string;
    id: string;
    isReply: boolean;
    inReplyToUsername?: string;
    createdAt?: string;
  }[] = [];

  let paginationToken: string | undefined;
  let fetched = 0;

  while (fetched < maxTweets) {
    const batchSize = Math.min(100, maxTweets - fetched);
    const timeline = await client.v2.userTimeline(userId, {
      max_results: batchSize,
      exclude: ["retweets"],
      "tweet.fields": [
        "created_at",
        "text",
        "public_metrics",
        "in_reply_to_user_id",
        "referenced_tweets",
      ],
      expansions: ["referenced_tweets.id", "in_reply_to_user_id"],
      "user.fields": ["username"],
      ...(paginationToken ? { pagination_token: paginationToken } : {}),
    });

    const tweets = timeline.data.data ?? [];
    const users = timeline.data.includes?.users ?? [];
    const userMap = new Map(users.map((u) => [u.id, u.username]));

    for (const tweet of tweets) {
      const isReply = tweet.referenced_tweets?.some(
        (ref) => ref.type === "replied_to"
      ) ?? tweet.text.startsWith("@");

      const inReplyToUserId = (tweet as unknown as Record<string, unknown>)
        .in_reply_to_user_id as string | undefined;

      allTweets.push({
        id: tweet.id,
        text: tweet.text,
        isReply,
        inReplyToUsername: inReplyToUserId
          ? userMap.get(inReplyToUserId)
          : undefined,
        createdAt: tweet.created_at,
      });
    }

    fetched += tweets.length;
    paginationToken = timeline.data.meta?.next_token;

    if (!paginationToken || tweets.length === 0) break;
  }

  return allTweets;
}

export async function getUserLikedTweets(
  accessToken: string,
  userId: string,
  maxResults = 50
) {
  const client = createXClient(accessToken);
  const liked = await client.v2.userLikedTweets(userId, {
    max_results: Math.min(maxResults, 100),
    "tweet.fields": ["created_at", "text", "author_id", "public_metrics"],
    expansions: ["author_id"],
    "user.fields": ["username", "name"],
  });

  const users = liked.data.includes?.users ?? [];
  const userMap = new Map(users.map((u) => [u.id, u.username]));

  return (liked.data.data ?? []).map((tweet) => ({
    text: tweet.text,
    authorUsername: userMap.get(tweet.author_id ?? "") ?? "unknown",
  }));
}

export async function getUserFollowing(
  accessToken: string,
  userId: string,
  maxResults = 100
) {
  const client = createXClient(accessToken);
  const following = await client.v2.following(userId, {
    max_results: Math.min(maxResults, 100),
    "user.fields": ["username", "name", "public_metrics", "description"],
  });

  return (following.data ?? []).map((user) => ({
    id: user.id,
    username: user.username,
    name: user.name,
    bio: (user as unknown as Record<string, unknown>).description as string | undefined,
    followersCount: user.public_metrics?.followers_count ?? 0,
  }));
}

/**
 * Batch-fetch follower counts for up to 100 usernames in a single API call.
 */
export async function getUsersByUsernames(
  accessToken: string,
  usernames: string[]
): Promise<{ id: string; username: string; followersCount: number }[]> {
  if (usernames.length === 0) return [];
  const client = createXClient(accessToken);
  const result = await client.v2.usersByUsernames(usernames.slice(0, 100), {
    "user.fields": ["public_metrics"],
  });
  return (result.data ?? []).map((u) => ({
    id: u.id,
    username: u.username.toLowerCase(),
    followersCount: u.public_metrics?.followers_count ?? 0,
  }));
}

/**
 * Fetch recent tweets from a specific account (not the authenticated user).
 * Optionally pass sinceId to only get tweets newer than that ID.
 */
export async function getAccountRecentTweets(
  accessToken: string,
  accountId: string,
  sinceId?: string
) {
  const client = createXClient(accessToken);
  const params: Record<string, unknown> = {
    max_results: 10,
    exclude: ["retweets", "replies"],
    "tweet.fields": ["created_at", "text", "author_id"],
  };

  if (sinceId) {
    params.since_id = sinceId;
  }

  const timeline = await client.v2.userTimeline(accountId, params as Parameters<typeof client.v2.userTimeline>[1]);
  return (timeline.data.data ?? []).map((tweet) => ({
    id: tweet.id,
    text: tweet.text,
    createdAt: tweet.created_at,
  }));
}

export async function postTweet(
  accessToken: string,
  text: string,
  replyToId?: string
) {
  const client = createXClient(accessToken);
  const params: { text: string; reply?: { in_reply_to_tweet_id: string } } = {
    text,
  };

  if (replyToId) {
    params.reply = { in_reply_to_tweet_id: replyToId };
  }

  const result = await client.v2.tweet(params);
  return result.data;
}
