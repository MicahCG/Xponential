import { ApifyClient } from "apify-client";
import { prisma } from "@/lib/prisma";
import { XPostError } from "./x-client";

const APIFY_ACTOR_ID = "T0jPxQieOXCJdsbFP";

function getApifyClient() {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    throw new XPostError({
      message:
        "APIFY_API_TOKEN is not configured. Add it to your environment variables.",
      isAuthError: true,
    });
  }
  return new ApifyClient({ token });
}

/**
 * Gets the stored Twitter cookie for a user's X platform connection.
 */
async function getTwitterCookie(userId: string): Promise<string> {
  const connection = await prisma.platformConnection.findUnique({
    where: {
      userId_platform: { userId, platform: "x" },
    },
  });

  if (!connection) {
    throw new XPostError({
      message: "X account not connected. Connect your X account first.",
      isAuthError: true,
    });
  }

  if (!connection.twitterCookie) {
    throw new XPostError({
      message:
        "Twitter cookie is not configured. Add your Twitter cookie in settings.",
      isAuthError: true,
    });
  }

  return connection.twitterCookie;
}

/**
 * Posts a tweet or reply via the Apify third-party actor.
 *
 * Uses cookie-based auth instead of the official X API, which avoids
 * the write-permission issues with OAuth 2.0 app tokens.
 *
 * Apify actor input schema (all strings):
 *   - cookie (required): Twitter session cookie (Header String format from Cookie-Editor extension)
 *   - tweetContent (required): The text to post
 *   - replyTweetId: ID of the tweet to reply to
 *   - mediaUrl: URL of image or video to attach
 *   - delegated_username: Delegated account username
 *   - schedule: Scheduled send time (Europe/London UTC+0, e.g. "2025-02-11 10:37:00")
 */
export async function postTweetViaApify(
  userId: string,
  text: string,
  replyToId?: string,
  mediaUrl?: string
): Promise<{ id: string }> {
  // Pre-flight validation
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

  const cookie = await getTwitterCookie(userId);
  const client = getApifyClient();

  const input: Record<string, string> = {
    cookie,
    tweetContent: text,
  };

  if (replyToId) {
    input.replyTweetId = replyToId;
  }

  if (mediaUrl) {
    input.mediaUrl = mediaUrl;
  }

  console.log(
    `[Apify] Posting tweet via Apify actor...`,
    replyToId ? `(reply to ${replyToId})` : "(original tweet)"
  );

  try {
    const run = await client.actor(APIFY_ACTOR_ID).call(input, {
      timeout: 60, // 60 second timeout
    });

    if (run.status !== "SUCCEEDED") {
      console.error("[Apify] Actor run failed:", {
        status: run.status,
        runId: run.id,
      });
      throw new XPostError({
        message: `Apify actor run failed with status: ${run.status}`,
        rawErrors: { runId: run.id, status: run.status },
      });
    }

    // Fetch the results from the run's dataset
    const { items } = await client
      .dataset(run.defaultDatasetId)
      .listItems();

    console.log("[Apify] Actor run completed. Dataset items:", items);

    // Check for errors in the output
    if (items.length === 0) {
      throw new XPostError({
        message: "Apify actor returned no results. The tweet may not have been posted.",
        rawErrors: { runId: run.id, items },
      });
    }

    const result = items[0] as Record<string, unknown>;

    // Check if the result contains an error message
    if (result.status_message && typeof result.status_message === "string") {
      // The actor returns status_message on errors (e.g. bad cookie)
      if (
        !result.tweet_id &&
        !result.id &&
        !result.tweetId
      ) {
        throw new XPostError({
          message: `Apify posting failed: ${result.status_message}`,
          rawErrors: result,
          isAuthError:
            result.status_message.includes("cookie") ||
            result.status_message.includes("auth"),
        });
      }
    }

    // Extract the tweet ID from the result
    // The actor may return it as tweet_id, tweetId, or id
    const tweetId =
      (result.tweet_id as string) ??
      (result.tweetId as string) ??
      (result.id as string) ??
      run.id; // fallback to run ID if no tweet ID returned

    console.log(
      `[Apify] Tweet posted successfully: id=${tweetId}`,
      replyToId ? `(reply to ${replyToId})` : "(original tweet)"
    );

    return { id: tweetId };
  } catch (error) {
    // Re-throw XPostErrors as-is
    if (error instanceof XPostError) {
      throw error;
    }

    console.error("[Apify] Unexpected error posting tweet:", error);
    throw new XPostError({
      message:
        error instanceof Error
          ? `Apify posting error: ${error.message}`
          : "Unexpected error posting tweet via Apify",
      rawErrors: error,
    });
  }
}
