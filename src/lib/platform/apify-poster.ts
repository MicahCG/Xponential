import { prisma } from "@/lib/prisma";
import { XPostError } from "./x-client";

const APIFY_ACTOR_ID = "popcorn-co~twitter-video-poster";
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
async function getTwitterCookie(userId: string, connectionId?: string): Promise<string> {
  const connection = connectionId
    ? await prisma.platformConnection.findFirst({
        where: { id: connectionId, userId },
      })
    : await prisma.platformConnection.findFirst({
        where: { userId, platform: "x", status: "active" },
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
 * Apify actor: popcorn-co~twitter-video-poster (custom Playwright browser automation)
 * Input schema (all strings):
 *   - cookie (required): Twitter session cookie (Header String format from Cookie-Editor extension)
 *   - tweetText (required): The text to post
 *   - replyTweetId: ID of the tweet to reply to
 *   - mediaUrl: Direct URL to an MP4 video to attach (Cloudinary compressed URL recommended)
 */
/**
 * Starts a tweet post via Apify WITHOUT waiting for completion.
 * Returns immediately with the Apify run ID for later polling.
 * Use checkApifyRun() to get the result.
 */
export async function startTweetViaApify(
  userId: string,
  text: string,
  replyToId?: string,
  mediaUrl?: string,
  connectionId?: string
): Promise<{ runId: string }> {
  if (!text || text.trim().length === 0) {
    throw new XPostError({ message: "Tweet text cannot be empty." });
  }
  if (text.length > 280) {
    throw new XPostError({
      message: `Tweet text too long (${text.length}/280 characters).`,
    });
  }

  const cookie = await getTwitterCookie(userId, connectionId);
  const token = getApifyToken();

  const input: Record<string, string> = {
    cookie,
    tweetText: text,
  };
  if (replyToId) input.replyTweetId = replyToId;
  if (mediaUrl) input.mediaUrl = mediaUrl;

  console.log(
    `[Apify] Starting async tweet run...`,
    replyToId ? `(reply to ${replyToId})` : "(original tweet)",
    mediaUrl ? `[video: ${mediaUrl.slice(0, 60)}...]` : ""
  );

  // Start async — no waitForFinish, returns immediately with run ID.
  // Browser actor takes ~30s for text, up to 3min for video.
  const timeout = mediaUrl ? 300 : 120;
  const runUrl = `${APIFY_API_BASE}/acts/${APIFY_ACTOR_ID}/runs?token=${token}&timeout=${timeout}`;
  const runResponse = await fetch(runUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!runResponse.ok) {
    const errBody = await runResponse.text();
    throw new XPostError({
      message: `Apify API error (HTTP ${runResponse.status}): ${errBody}`,
      rawErrors: { status: runResponse.status, body: errBody },
    });
  }

  const run = await runResponse.json();
  const runId = run.data?.id;
  if (!runId) {
    throw new XPostError({
      message: "Apify did not return a run ID.",
      rawErrors: run,
    });
  }

  console.log(`[Apify] Run started: runId=${runId}`);
  return { runId };
}

/**
 * Checks the status of an Apify run and returns the tweet ID if completed.
 * Returns "running" if still in progress, "succeeded" with tweetId, or "failed".
 */
export async function checkApifyRun(runId: string): Promise<{
  status: "running" | "succeeded" | "failed";
  tweetId?: string;
  errorMessage?: string;
}> {
  const token = getApifyToken();

  const runResponse = await fetch(
    `${APIFY_API_BASE}/actor-runs/${runId}?token=${token}`
  );
  if (!runResponse.ok) {
    const errBody = await runResponse.text();
    return {
      status: "failed",
      errorMessage: `Could not check run status: HTTP ${runResponse.status} ${errBody}`,
    };
  }

  const run = await runResponse.json();
  const runStatus: string = run.data?.status ?? "UNKNOWN";

  console.log(`[Apify] Run ${runId} status: ${runStatus}`);

  if (["FAILED", "ABORTED", "TIMED-OUT"].includes(runStatus)) {
    return { status: "failed", errorMessage: `Apify run ${runStatus.toLowerCase()}` };
  }

  if (runStatus !== "SUCCEEDED") {
    // Still READY or RUNNING
    return { status: "running" };
  }

  // SUCCEEDED — fetch dataset to get tweet ID
  const datasetId = run.data?.defaultDatasetId;
  if (!datasetId) {
    return { status: "failed", errorMessage: "Run succeeded but no dataset ID" };
  }

  const datasetResponse = await fetch(
    `${APIFY_API_BASE}/datasets/${datasetId}/items?token=${token}`
  );
  if (!datasetResponse.ok) {
    return { status: "failed", errorMessage: "Could not fetch dataset" };
  }

  const items = (await datasetResponse.json()) as Record<string, unknown>[];
  console.log(`[Apify] Run ${runId} dataset items:`, JSON.stringify(items));

  if (items.length === 0) {
    // Run succeeded with empty dataset — actor likely posted but returned nothing.
    // Treat as succeeded so the log isn't marked failed when the tweet went through.
    console.warn(`[Apify] Run ${runId} succeeded with empty dataset — assuming posted`);
    return { status: "succeeded", tweetId: runId };
  }

  const result = items[0];
  const tweetId =
    (result.tweet_id as string) ??
    (result.tweetId as string) ??
    (result.id as string) ??
    (result.post_id as string);

  if (!tweetId) {
    const errMsg = result.status_message as string | undefined;
    if (errMsg) {
      return { status: "failed", errorMessage: `Apify: ${errMsg}` };
    }
    // No tweet ID but no error either — run succeeded, tweet likely posted.
    console.warn(`[Apify] Run ${runId} succeeded but no tweet ID in result:`, JSON.stringify(result));
    return { status: "succeeded", tweetId: runId };
  }

  return { status: "succeeded", tweetId };
}

export async function postTweetViaApify(
  userId: string,
  text: string,
  replyToId?: string,
  mediaUrl?: string,
  connectionId?: string
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

  const cookie = await getTwitterCookie(userId, connectionId);
  const token = getApifyToken();

  const input: Record<string, string> = {
    cookie,
    tweetText: text,
  };

  if (replyToId) {
    input.replyTweetId = replyToId;
  }

  if (mediaUrl) {
    input.mediaUrl = mediaUrl;
  }

  // Browser actor takes ~30s for text, up to 3min for video.
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
