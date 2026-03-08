import { prisma } from "@/lib/prisma";
import { XPostError } from "./x-client";

const APIFY_ACTOR_ID = "T0jPxQieOXCJdsbFP";
const APIFY_API_BASE = "https://api.apify.com/v2";

function getApifyToken(): string {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    throw new XPostError({
      message:
        "APIFY_API_TOKEN is not configured. Add it to your environment variables.",
      isAuthError: true,
    });
  }
  return token;
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
 * Uses direct fetch() calls to the Apify REST API instead of the
 * apify-client SDK, which has dynamic require() issues with Next.js/webpack.
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
  const token = getApifyToken();

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

  // Video uploads require more time: Apify must download the file, upload to
  // Twitter's media API (chunked), wait for processing, then post.
  // Use 300s for video, 60s for text-only.
  const waitForFinish = mediaUrl ? 300 : 60;

  console.log(
    `[Apify] Posting tweet via Apify actor...`,
    replyToId ? `(reply to ${replyToId})` : "(original tweet)",
    mediaUrl ? `[video: ${mediaUrl.slice(0, 60)}... waitForFinish=${waitForFinish}s]` : ""
  );

  try {
    // Step 1: Start the actor run and wait for it to finish
    const runUrl = `${APIFY_API_BASE}/acts/${APIFY_ACTOR_ID}/runs?token=${token}&waitForFinish=${waitForFinish}`;
    const runResponse = await fetch(runUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!runResponse.ok) {
      const errBody = await runResponse.text();
      console.error("[Apify] Failed to start actor run:", runResponse.status, errBody);
      throw new XPostError({
        message: `Apify API error (HTTP ${runResponse.status}): ${errBody}`,
        rawErrors: { status: runResponse.status, body: errBody },
      });
    }

    const run = await runResponse.json();

    if (run.data?.status !== "SUCCEEDED") {
      console.error("[Apify] Actor run did not succeed:", {
        status: run.data?.status,
        runId: run.data?.id,
      });
      throw new XPostError({
        message: `Apify actor run failed with status: ${run.data?.status ?? "unknown"}`,
        rawErrors: { runId: run.data?.id, status: run.data?.status },
      });
    }

    const datasetId = run.data?.defaultDatasetId;
    if (!datasetId) {
      throw new XPostError({
        message: "Apify actor run completed but returned no dataset ID.",
        rawErrors: run.data,
      });
    }

    // Step 2: Fetch results from the dataset
    const datasetUrl = `${APIFY_API_BASE}/datasets/${datasetId}/items?token=${token}`;
    const datasetResponse = await fetch(datasetUrl);

    if (!datasetResponse.ok) {
      const errBody = await datasetResponse.text();
      throw new XPostError({
        message: `Failed to fetch Apify dataset: HTTP ${datasetResponse.status}`,
        rawErrors: { status: datasetResponse.status, body: errBody },
      });
    }

    const items = (await datasetResponse.json()) as Record<string, unknown>[];

    console.log("[Apify] Actor run completed. Dataset items:", items);

    // Check for errors in the output
    if (items.length === 0) {
      throw new XPostError({
        message: "Apify actor returned no results. The tweet may not have been posted.",
        rawErrors: { runId: run.data?.id, items },
      });
    }

    const result = items[0];

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
            (result.status_message as string).includes("cookie") ||
            (result.status_message as string).includes("auth"),
        });
      }
    }

    // Extract the tweet ID from the result
    // The actor may return it as tweet_id, tweetId, or id
    const tweetId =
      (result.tweet_id as string) ??
      (result.tweetId as string) ??
      (result.id as string) ??
      run.data?.id; // fallback to run ID if no tweet ID returned

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
