import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { postTweetWithRetry, XPostError } from "@/lib/platform/x-client";
import { postLinkedInComment } from "@/lib/platform/linkedin-client";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    console.error("[auto-reply approve] No session found — returning 401");
    return NextResponse.json(
      { error: "Session expired — please log in again", source: "session" },
      { status: 401 }
    );
  }

  console.log(`[auto-reply approve] User ${session.user.id} attempting action`);

  const { id } = await params;
  const body = await request.json();
  const action = body.action; // "approve" or "reject"
  const editedContent = body.content as string | undefined;

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

  // Approve: post the reply (use edited content if provided)
  const contentToPost = editedContent?.trim() || replyLog.replyContent;

  // Determine platform from the watched account
  const watchedAccount = await prisma.watchedAccount.findUnique({
    where: { id: replyLog.watchedAccountId },
    select: { platform: true },
  });
  const platform = watchedAccount?.platform ?? "x";

  try {
    let postedId: string;

    if (platform === "linkedin") {
      const connection = await prisma.platformConnection.findUnique({
        where: { userId_platform: { userId: session.user.id, platform: "linkedin" } },
      });
      if (!connection || connection.status !== "active") {
        return NextResponse.json(
          { error: "LinkedIn account not connected", source: "linkedin", errorType: "auth", retryable: true },
          { status: 401 }
        );
      }
      const authorUrn = `urn:li:person:${connection.accountId}`;
      const result = await postLinkedInComment(
        connection.accessToken,
        authorUrn,
        replyLog.targetTweetId,
        contentToPost
      );
      postedId = result.id;
    } else {
      const result = await postTweetWithRetry(
        session.user.id,
        contentToPost,
        replyLog.targetTweetId,
        replyLog.videoUrl ?? undefined
      );
      postedId = result.id;
    }

    await prisma.autoReplyLog.update({
      where: { id },
      data: {
        status: "posted",
        replyContent: contentToPost,
        replyTweetId: postedId,
        postedAt: new Date(),
      },
    });

    await prisma.postHistory.create({
      data: {
        userId: session.user.id,
        platform,
        postType: "reply",
        content: contentToPost,
        targetPostId: replyLog.targetTweetId,
        targetAuthor: replyLog.targetAuthor,
        videoUrl: replyLog.videoUrl,
        videoFormat: replyLog.videoUrl ? "mp4" : undefined,
        platformPostId: postedId,
      },
    });

    return NextResponse.json({ success: true, status: "posted", tweetId: postedId });
  } catch (error) {
    console.error("Approve auto-reply error:", error);

    // Determine appropriate status — auth/token errors should be "pending"
    // so the user can reconnect and retry, not permanently "failed"
    const isRetryable =
      error instanceof XPostError &&
      (error.isAuthError || error.isRateLimit || error.isTokenExpired);

    const newStatus = isRetryable ? "pending" : "failed";

    await prisma.autoReplyLog.update({
      where: { id },
      data: { status: newStatus },
    });

    // Build actionable error response
    if (error instanceof XPostError) {
      console.error("[auto-reply approve] XPostError:", {
        message: error.message,
        httpCode: error.httpCode,
        isAuth: error.isAuthError,
        isRateLimit: error.isRateLimit,
        isDuplicate: error.isDuplicate,
        rawErrors: error.rawErrors,
      });
      return NextResponse.json(
        {
          error: error.message,
          source: "x_api",
          errorType: error.isAuthError
            ? "auth"
            : error.isRateLimit
              ? "rate_limit"
              : error.isDuplicate
                ? "duplicate"
                : "api_error",
          httpCode: error.httpCode,
          retryable: isRetryable,
        },
        { status: error.httpCode === 429 ? 429 : error.isAuthError ? 401 : 500 }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to post reply" },
      { status: 500 }
    );
  }
}
