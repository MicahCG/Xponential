/**
 * Direct Twitter API calls using cookie-based authentication.
 * Used for video upload since Apify's actor doesn't support video.
 *
 * Flow:
 *   1. startVideoUpload()  — download MP4, INIT+APPEND+FINALIZE to Twitter media API
 *   2. checkVideoUpload()  — poll Twitter STATUS until processing completes
 *   3. postTweetDirect()   — POST /2/tweets with media_id
 */

import { prisma } from "@/lib/prisma";

// Twitter's hardcoded web-app bearer token (same one every browser uses)
const TWITTER_BEARER =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
const UPLOAD_URL = "https://upload.twitter.com/1.1/media/upload.json";

function parseCt0(cookieStr: string): string {
  const match = cookieStr.match(/(?:^|;)\s*ct0=([^;]+)/);
  return match?.[1]?.trim() ?? "";
}

function authHeaders(cookieStr: string): Record<string, string> {
  return {
    Authorization: `Bearer ${TWITTER_BEARER}`,
    Cookie: cookieStr,
    "X-Csrf-Token": parseCt0(cookieStr),
    "Origin": "https://x.com",
    "Referer": "https://x.com/",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  };
}

async function getTwitterCookie(userId: string): Promise<string> {
  const conn = await prisma.platformConnection.findUnique({
    where: { userId_platform: { userId, platform: "x" } },
  });
  if (!conn?.twitterCookie) {
    throw new Error("No Twitter cookie found — add it in Settings.");
  }
  return conn.twitterCookie;
}

/**
 * Downloads the video from videoUrl, uploads it to Twitter via chunked
 * media upload (INIT → APPEND → FINALIZE), and returns the media_id.
 * Async: Twitter still needs to process the video after this returns.
 */
export async function startVideoUpload(
  userId: string,
  videoUrl: string
): Promise<{ mediaId: string }> {
  const cookie = await getTwitterCookie(userId);
  const headers = authHeaders(cookie);

  // Download the video into memory
  console.log(`[TwitterDirect] Downloading video: ${videoUrl.slice(0, 80)}...`);
  const videoRes = await fetch(videoUrl);
  if (!videoRes.ok) {
    throw new Error(`Failed to download video (HTTP ${videoRes.status})`);
  }
  const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
  const totalBytes = videoBuffer.length;
  console.log(`[TwitterDirect] Downloaded ${(totalBytes / 1024 / 1024).toFixed(1)} MB`);

  // INIT
  const initRes = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      command: "INIT",
      total_bytes: String(totalBytes),
      media_type: "video/mp4",
      media_category: "tweet_video",
    }),
  });
  const initData = await initRes.json();
  console.log(`[TwitterDirect] INIT response:`, JSON.stringify(initData));
  const mediaId: string = initData.media_id_string;
  if (!mediaId) {
    throw new Error(`Media INIT failed: ${JSON.stringify(initData)}`);
  }

  // APPEND in 5 MB chunks
  const CHUNK_SIZE = 5 * 1024 * 1024;
  for (let i = 0; i * CHUNK_SIZE < totalBytes; i++) {
    const chunk = videoBuffer.subarray(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    const form = new FormData();
    form.append("command", "APPEND");
    form.append("media_id", mediaId);
    form.append("segment_index", String(i));
    form.append("media", new Blob([chunk], { type: "video/mp4" }));
    const appendRes = await fetch(UPLOAD_URL, { method: "POST", headers, body: form });
    console.log(`[TwitterDirect] APPEND segment ${i}: HTTP ${appendRes.status}`);
  }

  // FINALIZE
  const finalRes = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ command: "FINALIZE", media_id: mediaId }),
  });
  const finalData = await finalRes.json();
  console.log(`[TwitterDirect] FINALIZE response:`, JSON.stringify(finalData));

  if (finalData.error || finalData.errors) {
    throw new Error(`Media FINALIZE failed: ${JSON.stringify(finalData)}`);
  }

  return { mediaId };
}

/**
 * Polls Twitter's media STATUS endpoint.
 * Returns "processing", "succeeded", or "failed".
 */
export async function checkVideoUpload(
  userId: string,
  mediaId: string
): Promise<{ state: "processing" | "succeeded" | "failed"; error?: string }> {
  const cookie = await getTwitterCookie(userId);
  const headers = authHeaders(cookie);

  const res = await fetch(
    `${UPLOAD_URL}?command=STATUS&media_id=${mediaId}`,
    { headers }
  );
  const data = await res.json();
  console.log(`[TwitterDirect] STATUS for ${mediaId}:`, JSON.stringify(data));

  const procInfo = data.processing_info;
  if (!procInfo) {
    // No processing_info means it's immediately available (small file)
    return { state: "succeeded" };
  }
  if (procInfo.state === "succeeded") return { state: "succeeded" };
  if (procInfo.state === "failed") {
    return { state: "failed", error: procInfo.error?.message ?? "Processing failed" };
  }
  return { state: "processing" };
}

async function getOAuthAccessToken(userId: string): Promise<string> {
  const conn = await prisma.platformConnection.findUnique({
    where: { userId_platform: { userId, platform: "x" } },
  });
  if (!conn?.accessToken) {
    throw new Error("No OAuth access token found for X — reconnect your account.");
  }
  return conn.accessToken;
}

/**
 * Posts a tweet with an already-uploaded media_id using the stored
 * OAuth 2.0 user access token (tweet.write scope).
 * Media upload uses cookie auth; tweet posting uses OAuth to avoid blocks.
 */
export async function postTweetDirect(
  userId: string,
  text: string,
  mediaId: string,
  replyToId?: string
): Promise<{ id: string }> {
  const accessToken = await getOAuthAccessToken(userId);

  const body: Record<string, unknown> = {
    text,
    media: { media_ids: [mediaId] },
  };
  if (replyToId) {
    body.reply = { in_reply_to_tweet_id: replyToId };
  }

  console.log(`[TwitterDirect] Posting tweet (OAuth) with mediaId=${mediaId}`, replyToId ? `(reply to ${replyToId})` : "");

  const res = await fetch("https://api.twitter.com/2/tweets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  console.log(`[TwitterDirect] Tweet post response:`, JSON.stringify(data));

  const tweetId = data.data?.id;
  if (!tweetId) {
    throw new Error(`Tweet post failed: ${JSON.stringify(data)}`);
  }
  return { id: tweetId };
}
