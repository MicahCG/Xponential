import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const replies = await prisma.autoReplyLog.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      targetTweetId: true,
      targetTweetText: true,
      targetAuthor: true,
      replyContent: true,
      replyType: true,
      replyTweetId: true,
      videoUrl: true,
      status: true,
      errorMessage: true,
      createdAt: true,
      postedAt: true,
      watchedAccount: { select: { accountHandle: true, platform: true } },
    },
  });

  return NextResponse.json({ replies });
}
