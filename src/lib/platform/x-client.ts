import { TwitterApi, ApiResponseError, ApiRequestError } from "twitter-api-v2";
import { prisma } from "@/lib/prisma";
import { refreshAccessToken } from "@/lib/oauth/x";

/**
 * Custom error class for X API posting failures.
 * Contains structured information about what went wrong.
 */
export class XPostError extends Error {
  public readonly httpCode: number | null;
  public readonly xErrorCode: number | string | null;
  public readonly isAuthError: boolean;
  public readonly isRateLimit: boolean;
  public readonly isDuplicate: boolean;
  public readonly isTokenExpired: boolean;
  public readonly rawErrors: unknown;

  constructor(opts: {
    message: string;
    httpCode?: number | null;
    xErrorCode?: number | string | null;
    isAuthError?: boolean;
    isRateLimit?: boolean;
    isDuplicate?: boolean;
    isTokenExpired?: boolean;
    rawErrors?: unknown;
  }) {
    super(opts.message);
    this.name = "XPostError";
    this.httpCode = opts.httpCode ?? null;
    this.xErrorCode = opts.xErrorCode ?? null;
    this.isAuthError = opts.isAuthError ?? false;
    this.isRateLimit = opts.isRateLimit ?? false;
    this.isDuplicate = opts.isDuplicate ?? false;
    this.isTokenExpired = opts.isTokenExpired ?? false;
    this.rawErrors = opts.rawErrors;
  }
}

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
  return forceRefreshToken(userId);
}

/**
 * Force-refreshes the X access token regardless of expiry.
 * Used when the stored token is rejected by X (401) even though
 * our DB thinks it's still valid.
 */
export async function forceRefreshToken(userId: string): Promise<string> {
  const connection = await prisma.platformConnection.findUnique({
    where: {
      userId_platform: { userId, platform: "x" },
    },
  });

  if (!connection) {
    throw new Error("X account not connected. Connect your X account first.");
  }

  if (!connection.refreshToken) {
    throw new Error(
      "X token expired and no refresh token available. Please reconnect your X account."
    );
  }

  console.log(`[X Auth] Force-refreshing token for user ${userId}...`);

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
        status: "active",
      },
    });

    console.log("[X Auth] Token refreshed successfully");
    return refreshed.access_token;
  } catch (err) {
    console.error("[X Auth] Failed to refresh token:", err);
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

/**
 * Posts a tweet with automatic token refresh on 401.
 * If the first attempt fails with an auth error, forces a token refresh
 * and retries exactly once before giving up.
 */
export async function postTweetWithRetry(
  userId: string,
  text: string,
  replyToId?: string
): Promise<{ id: string }> {
  const accessToken = await getValidAccessToken(userId);

  try {
    return await postTweet(accessToken, text, replyToId);
  } catch (error) {
    // If auth error, force-refresh the token and retry once
    if (error instanceof XPostError && error.isAuthError) {
      console.log("[X API] Auth error on post — force-refreshing token and retrying...");

      try {
        const freshToken = await forceRefreshToken(userId);
        return await postTweet(freshToken, text, replyToId);
      } catch (retryError) {
        // If retry also fails, throw that error
        console.error("[X API] Retry after token refresh also failed:", retryError);
        throw retryError;
      }
    }

    // Non-auth errors: re-throw immediately
    throw error;
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
  const allLiked: { text: string; authorUsername: string }[] = [];
  let paginationToken: string | undefined;
  let fetched = 0;

  while (fetched < maxResults) {
    const batchSize = Math.min(100, maxResults - fetched);
    const liked = await client.v2.userLikedTweets(userId, {
      max_results: batchSize,
      "tweet.fields": ["created_at", "text", "author_id", "public_metrics"],
      expansions: ["author_id"],
      "user.fields": ["username", "name"],
      ...(paginationToken ? { pagination_token: paginationToken } : {}),
    });

    const users = liked.data.includes?.users ?? [];
    const userMap = new Map(users.map((u) => [u.id, u.username]));
    const tweets = liked.data.data ?? [];

    for (const tweet of tweets) {
      allLiked.push({
        text: tweet.text,
        authorUsername: userMap.get(tweet.author_id ?? "") ?? "unknown",
      });
    }

    fetched += tweets.length;
    paginationToken = liked.data.meta?.next_token;

    if (!paginationToken || tweets.length === 0) break;
  }

  return allLiked;
}

export async function getUserFollowing(
  accessToken: string,
  userId: string,
  maxResults = 100
) {
  const client = createXClient(accessToken);
  const allFollowing: {
    id: string;
    username: string;
    name: string;
    bio?: string;
    followersCount: number;
  }[] = [];
  let paginationToken: string | undefined;
  let fetched = 0;

  while (fetched < maxResults) {
    const batchSize = Math.min(100, maxResults - fetched);
    const following = await client.v2.following(userId, {
      max_results: batchSize,
      "user.fields": ["username", "name", "public_metrics", "description"],
      ...(paginationToken ? { pagination_token: paginationToken } : {}),
    });

    const users = following.data ?? [];
    for (const user of users) {
      allFollowing.push({
        id: user.id,
        username: user.username,
        name: user.name,
        bio: (user as unknown as Record<string, unknown>).description as string | undefined,
        followersCount: user.public_metrics?.followers_count ?? 0,
      });
    }

    fetched += users.length;
    paginationToken = following.meta?.next_token;

    if (!paginationToken || users.length === 0) break;
  }

  return allFollowing;
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
    max_results: 50,
    exclude: ["retweets"],
    "tweet.fields": ["created_at", "text", "author_id", "referenced_tweets"],
    expansions: ["referenced_tweets.id"],
  };

  if (sinceId) {
    params.since_id = sinceId;
  }

  const timeline = await client.v2.userTimeline(accountId, params as Parameters<typeof client.v2.userTimeline>[1]);

  // Build a map of referenced tweets so we can include quoted tweet text
  const refTweets = timeline.data.includes?.tweets ?? [];
  const refMap = new Map(refTweets.map((t) => [t.id, t.text]));

  return (timeline.data.data ?? []).map((tweet) => {
    const quotedRef = tweet.referenced_tweets?.find((r) => r.type === "quoted");
    const quotedText = quotedRef ? refMap.get(quotedRef.id) : undefined;

    return {
      id: tweet.id,
      text: quotedText
        ? `${tweet.text}\n\n[Quoted tweet]: ${quotedText}`
        : tweet.text,
      createdAt: tweet.created_at,
    };
  });
}

export async function postTweet(
  accessToken: string,
  text: string,
  replyToId?: string
) {
  // Pre-flight validation
  if (!accessToken) {
    throw new XPostError({
      message: "No access token provided. Please reconnect your X account.",
      isAuthError: true,
      isTokenExpired: true,
    });
  }

  if (!text || text.trim().length === 0) {
    throw new XPostError({
      message: "Tweet text cannot be empty.",
    });
  }

  if (text.length > 280) {
    throw new XPostError({
      message: `Tweet text too long (${text.length}/280 characters).`,
    });
  }

  const client = createXClient(accessToken);
  const params: { text: string; reply?: { in_reply_to_tweet_id: string } } = {
    text,
  };

  if (replyToId) {
    params.reply = { in_reply_to_tweet_id: replyToId };
  }

  try {
    const result = await client.v2.tweet(params);
    console.log(
      `[X API] Tweet posted successfully: id=${result.data.id}`,
      replyToId ? `(reply to ${replyToId})` : "(original tweet)"
    );
    return result.data;
  } catch (error) {
    // Handle X API response errors (HTTP 4xx/5xx from X)
    if (error instanceof ApiResponseError) {
      const errJson = error.toJSON();
      console.error("[X API] ApiResponseError posting tweet:", {
        httpCode: error.code,
        isAuthError: error.isAuthError,
        rateLimitError: error.rateLimitError,
        errors: error.errors,
        data: error.data,
        rateLimit: error.rateLimit,
        message: error.message,
      });

      // Check for specific error codes
      const v1Errors = (error.errors ?? []) as { code?: number; message?: string }[];
      const firstErrorCode = v1Errors[0]?.code;

      // Duplicate tweet
      if (error.hasErrorCode(187)) {
        throw new XPostError({
          message: "This tweet has already been posted (duplicate content detected by X).",
          httpCode: error.code,
          xErrorCode: 187,
          isDuplicate: true,
          rawErrors: errJson,
        });
      }

      // Auth / token errors
      if (error.isAuthError || error.code === 401 || error.code === 403) {
        const isExpired = error.hasErrorCode(89); // InvalidOrExpiredToken
        const noWriteRight = error.hasErrorCode(261); // NoWriteRightForApp

        let message = "X API authentication failed.";
        if (isExpired) {
          message = "X access token is expired or invalid. Please reconnect your X account.";
        } else if (noWriteRight) {
          message = "Your X app does not have write permissions. Check your X Developer Portal app settings.";
        } else if (error.code === 403) {
          message = `X API forbidden (403): ${error.data?.detail || error.data?.error || error.message}. This may be an app permissions issue.`;
        } else {
          message = `X API auth error (${error.code}): ${error.data?.detail || error.data?.error || error.message}`;
        }

        throw new XPostError({
          message,
          httpCode: error.code,
          xErrorCode: firstErrorCode ?? null,
          isAuthError: true,
          isTokenExpired: isExpired,
          rawErrors: errJson,
        });
      }

      // Rate limit
      if (error.rateLimitError || error.code === 429) {
        const resetTime = error.rateLimit?.reset
          ? new Date(error.rateLimit.reset * 1000).toISOString()
          : "unknown";
        throw new XPostError({
          message: `X API rate limit exceeded. Try again after ${resetTime}.`,
          httpCode: 429,
          xErrorCode: 88,
          isRateLimit: true,
          rawErrors: errJson,
        });
      }

      // Tweet-specific errors
      if (error.hasErrorCode(385)) {
        throw new XPostError({
          message: "Cannot reply to this tweet — the original tweet has been deleted.",
          httpCode: error.code,
          xErrorCode: 385,
          rawErrors: errJson,
        });
      }

      if (error.hasErrorCode(186)) {
        throw new XPostError({
          message: "Tweet text is too long according to X API.",
          httpCode: error.code,
          xErrorCode: 186,
          rawErrors: errJson,
        });
      }

      // Generic API error with details
      const detail = error.data?.detail || error.data?.error || error.message;
      throw new XPostError({
        message: `X API error (HTTP ${error.code}): ${detail}`,
        httpCode: error.code,
        xErrorCode: firstErrorCode ?? null,
        rawErrors: errJson,
      });
    }

    // Handle network / request errors (couldn't even reach X)
    if (error instanceof ApiRequestError) {
      console.error("[X API] ApiRequestError (network issue):", {
        message: error.message,
        requestError: error.requestError,
      });
      throw new XPostError({
        message: `Network error connecting to X API: ${error.message}. Please try again.`,
      });
    }

    // Unknown error type — log everything and re-throw
    console.error("[X API] Unknown error posting tweet:", error);
    throw new XPostError({
      message: error instanceof Error
        ? `Unexpected error posting tweet: ${error.message}`
        : "Unexpected error posting tweet",
      rawErrors: error,
    });
  }
}
