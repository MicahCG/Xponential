import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getValidAccessToken, createXClient } from "@/lib/platform/x-client";
import { prisma } from "@/lib/prisma";

/**
 * Extracts a tweet ID from a twitter.com or x.com URL.
 * Supports formats like:
 *   https://twitter.com/user/status/123456
 *   https://x.com/user/status/123456
 *   https://twitter.com/user/status/123456?s=20
 */
function extractTweetId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (
      parsed.hostname !== "twitter.com" &&
      parsed.hostname !== "www.twitter.com" &&
      parsed.hostname !== "x.com" &&
      parsed.hostname !== "www.x.com"
    ) {
      return null;
    }
    const match = parsed.pathname.match(/\/status(?:es)?\/(\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { url } = body as { url?: string };

  if (!url || typeof url !== "string") {
    return NextResponse.json(
      { error: "Missing url parameter" },
      { status: 400 }
    );
  }

  const tweetId = extractTweetId(url.trim());
  if (!tweetId) {
    return NextResponse.json(
      { error: "Invalid tweet URL. Paste a link like https://x.com/user/status/123456" },
      { status: 400 }
    );
  }

  // Get X connection to find platform user ID
  const connection = await prisma.platformConnection.findUnique({
    where: {
      userId_platform: { userId: session.user.id, platform: "x" },
    },
  });

  if (!connection || connection.status !== "active") {
    return NextResponse.json(
      { error: "X account not connected. Connect your X account first." },
      { status: 400 }
    );
  }

  try {
    const accessToken = await getValidAccessToken(session.user.id);
    const client = createXClient(accessToken);

    const tweet = await client.v2.singleTweet(tweetId, {
      "tweet.fields": ["text", "author_id"],
      expansions: ["author_id"],
      "user.fields": ["username"],
    });

    if (!tweet.data) {
      return NextResponse.json(
        { error: "Tweet not found or is not accessible" },
        { status: 404 }
      );
    }

    const authorUser = tweet.includes?.users?.[0];

    return NextResponse.json({
      text: tweet.data.text,
      author: authorUser?.username ?? null,
      tweetId,
    });
  } catch (err) {
    console.error("[fetch-tweet] Error:", err);
    return NextResponse.json(
      { error: "Failed to fetch tweet. It may be private or deleted." },
      { status: 500 }
    );
  }
}
