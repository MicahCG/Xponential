import { prisma } from "@/lib/prisma";
import { postTweetWithRetry } from "@/lib/platform/x-client";

export async function publishQueueItem(queueItemId: string, userId: string) {
  const item = await prisma.contentQueue.findFirst({
    where: { id: queueItemId, userId },
  });

  if (!item) {
    throw new Error("Queue item not found");
  }

  if (item.status !== "approved") {
    throw new Error("Queue item must be approved before publishing");
  }

  const connection = await prisma.platformConnection.findFirst({
    where: { userId, platform: item.platform, status: "active" },
  });

  if (!connection || connection.status !== "active") {
    throw new Error(
      `${item.platform} account not connected or token expired. Please reconnect.`
    );
  }

  let platformPostId: string | undefined;

  if (item.platform === "x") {
    const result = await postTweetWithRetry(
      userId,
      item.content,
      item.targetPostId ?? undefined,
      item.videoUrl ?? undefined
    );
    platformPostId = result.id;
  }

  // Update queue item status
  await prisma.contentQueue.update({
    where: { id: queueItemId },
    data: { status: "posted" },
  });

  // Record in post history
  await prisma.postHistory.create({
    data: {
      userId,
      platform: item.platform,
      postType: item.postType,
      barrel: item.barrel,
      content: item.content,
      targetPostId: item.targetPostId,
      targetAuthor: item.targetAuthor,
      platformPostId,
    },
  });

  return { platformPostId, platform: item.platform };
}
