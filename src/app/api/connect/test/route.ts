import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TwitterApi, ApiResponseError, ApiRequestError } from "twitter-api-v2";
import { getValidAccessToken, forceRefreshToken } from "@/lib/platform/x-client";

/**
 * Diagnostic endpoint: Tests the X API connection for read AND write capability.
 * Returns detailed information about what's working and what's not.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const diagnostics: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    userId,
  };

  // Step 1: Check connection exists in DB
  const connection = await prisma.platformConnection.findUnique({
    where: { userId_platform: { userId, platform: "x" } },
    select: {
      id: true,
      status: true,
      accountHandle: true,
      tokenExpires: true,
      accessToken: true,
      refreshToken: true,
    },
  });

  if (!connection) {
    return NextResponse.json({
      ...diagnostics,
      result: "FAIL",
      issue: "No X connection found in database",
      fix: "Connect your X account from the Connections page",
    });
  }

  diagnostics.connectionStatus = connection.status;
  diagnostics.accountHandle = connection.accountHandle;
  diagnostics.tokenExpires = connection.tokenExpires?.toISOString() ?? "null";
  diagnostics.hasRefreshToken = !!connection.refreshToken;
  diagnostics.tokenPrefix = connection.accessToken?.substring(0, 10) + "...";

  const isExpired = connection.tokenExpires
    ? new Date(connection.tokenExpires).getTime() < Date.now()
    : false;
  diagnostics.tokenExpiredInDB = isExpired;

  // Step 2: Try to get a valid token
  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(userId);
    diagnostics.getTokenResult = "OK";
  } catch (err) {
    diagnostics.getTokenResult = "FAIL";
    diagnostics.getTokenError = err instanceof Error ? err.message : String(err);

    // Try force refresh
    try {
      accessToken = await forceRefreshToken(userId);
      diagnostics.forceRefreshResult = "OK";
    } catch (refreshErr) {
      diagnostics.forceRefreshResult = "FAIL";
      diagnostics.forceRefreshError =
        refreshErr instanceof Error ? refreshErr.message : String(refreshErr);

      return NextResponse.json({
        ...diagnostics,
        result: "FAIL",
        issue: "Cannot obtain a valid access token",
        fix: "Disconnect and reconnect your X account",
      });
    }
  }

  const client = new TwitterApi(accessToken!);

  // Step 3: Test READ — fetch user profile
  try {
    const me = await client.v2.me({
      "user.fields": ["username", "name"],
    });
    diagnostics.readTest = "OK";
    diagnostics.readUser = { id: me.data.id, username: me.data.username };
  } catch (err) {
    diagnostics.readTest = "FAIL";
    if (err instanceof ApiResponseError) {
      diagnostics.readError = {
        httpCode: err.code,
        isAuthError: err.isAuthError,
        message: err.message,
        data: err.data,
        errors: err.errors,
      };
    } else {
      diagnostics.readError =
        err instanceof Error ? err.message : String(err);
    }
  }

  // Step 4: Test WRITE — attempt to create a tweet (then immediately delete it)
  try {
    const testText = `Connection test ${Date.now()} — this tweet will be deleted immediately.`;
    const posted = await client.v2.tweet({ text: testText });
    diagnostics.writeTest = "OK";
    diagnostics.writeTweetId = posted.data.id;

    // Clean up: delete the test tweet
    try {
      await client.v2.deleteTweet(posted.data.id);
      diagnostics.deleteCleanup = "OK";
    } catch {
      diagnostics.deleteCleanup = "FAIL (tweet was posted but cleanup failed — you may want to delete it manually)";
    }
  } catch (err) {
    diagnostics.writeTest = "FAIL";
    if (err instanceof ApiResponseError) {
      const errDetails = {
        httpCode: err.code,
        isAuthError: err.isAuthError,
        rateLimitError: err.rateLimitError,
        message: err.message,
        data: err.data,
        errors: err.errors,
        rateLimit: err.rateLimit,
      };
      diagnostics.writeError = errDetails;

      // Diagnose specific causes
      if (err.code === 401) {
        diagnostics.diagnosis =
          "Token is valid for reads but rejected for writes. This typically means your X Developer Portal app permissions are set to 'Read-only' instead of 'Read and Write'. Check: developer.x.com → Your App → Settings → User authentication settings → App permissions.";
        diagnostics.fix =
          "1) Set app permissions to 'Read and Write' in X Developer Portal. 2) After saving, disconnect your X account in Xponential. 3) Reconnect it to get a fresh token with write scope.";
      } else if (err.code === 403) {
        const detail = err.data?.detail || err.data?.error || err.message;
        if (detail?.includes("client-forbidden") || detail?.includes("forbidden")) {
          diagnostics.diagnosis =
            "X API returned 403 Forbidden. This could mean: (a) your API plan tier doesn't support tweet creation, (b) your app permissions don't include write, or (c) the tweet.write scope wasn't granted during OAuth.";
          diagnostics.fix =
            "Check your X Developer Portal for: 1) API plan tier (free tier may not support posting anymore). 2) App permissions = 'Read and Write'. 3) Disconnect and reconnect your X account.";
        } else {
          diagnostics.diagnosis = `X API returned 403: ${detail}`;
        }
      } else if (err.code === 429) {
        diagnostics.diagnosis = "Rate limited by X API.";
        diagnostics.fix = "Wait and try again later.";
      }
    } else if (err instanceof ApiRequestError) {
      diagnostics.writeError = {
        type: "network",
        message: err.message,
      };
      diagnostics.diagnosis = "Network error reaching X API.";
    } else {
      diagnostics.writeError =
        err instanceof Error ? err.message : String(err);
    }
  }

  const overallResult =
    diagnostics.readTest === "OK" && diagnostics.writeTest === "OK"
      ? "ALL_PASS"
      : diagnostics.readTest === "OK" && diagnostics.writeTest === "FAIL"
        ? "READ_ONLY"
        : "FAIL";

  return NextResponse.json({
    ...diagnostics,
    result: overallResult,
  });
}
