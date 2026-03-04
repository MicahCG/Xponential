import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getValidAccessToken } from "@/lib/platform/x-client";
import { postTweet } from "@/lib/platform/x-client";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const action = body.action; // "approve" or "reject"

  if (!["approve", "reject"].includes(action)) {
    return NextResponse.json(
      { error: "Invalid action. Expected 'approve' or 'reject'" },
      { status: 400 }
    );
  }

  const replyLog = await prisma.autoReplyLog.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!replyLog) {
    return NextResponse.json({ error: "Reply not found" }, { status: 404 });
  }

  if (replyLog.status !== "pending") {
    return NextResponse.json(
      { error: "Reply is no longer pending" },
      { status: 400 }
    );
  }

  if (action === "reject") {
    await prisma.autoReplyLog.update({
      where: { id },
      data: { status: "rejected" },
    });
    return NextResponse.json({ success: true, status: "rejected" });
  }

  // Approve: post the reply
  try {
    const accessToken = await getValidAccessToken(session.user.id);
    const result = await postTweet(
      accessToken,
      replyLog.replyContent,
      replyLog.targetTweetId
    );

    await prisma.autoReplyLog.update({
      where: { id },
      data: {
        status: "posted",
        replyTweetId: result.id,
        postedAt: new Date(),
      },
    });

    // Also record in post history
    await prisma.postHistory.create({
      data: {
        userId: session.user.id,
        platform: "x",
        postType: "reply",
        content: replyLog.replyContent,
        targetPostId: replyLog.targetTweetId,
        targetAuthor: replyLog.targetAuthor,
        platformPostId: result.id,
      },
    });

    return NextResponse.json({ success: true, status: "posted", tweetId: result.id });
  } catch (error) {
    console.error("Approve auto-reply error:", error);

    await prisma.autoReplyLog.update({
      where: { id },
      data: { status: "failed" },
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to post reply" },
      { status: 500 }
    );
  }
}
