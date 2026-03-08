import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { postTweetWithRetry, XPostError } from "@/lib/platform/x-client";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const caption = (body.caption as string)?.trim();
  const videoUrl = (body.videoUrl as string)?.trim();

  if (!caption) {
    return NextResponse.json({ error: "Caption is required" }, { status: 400 });
  }
  if (!videoUrl) {
    return NextResponse.json({ error: "Video URL is required" }, { status: 400 });
  }

  try {
    const posted = await postTweetWithRetry(
      session.user.id,
      caption,
      undefined,
      videoUrl
    );

    await prisma.postHistory.create({
      data: {
        userId: session.user.id,
        platform: "x",
        postType: "original",
        content: caption,
        videoUrl,
        videoFormat: "mp4",
        platformPostId: posted.id,
      },
    });

    return NextResponse.json({ success: true, tweetId: posted.id });
  } catch (error) {
    console.error("[video/post] Post error:", error);
    if (error instanceof XPostError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.isAuthError ? 401 : 500 }
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to post" },
      { status: 500 }
    );
  }
}
