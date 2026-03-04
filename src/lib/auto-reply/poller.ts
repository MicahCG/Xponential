import { prisma } from "@/lib/prisma";
import { getValidAccessToken, getAccountRecentTweets, postTweet } from "@/lib/platform/x-client";
import { generateContent } from "@/lib/content/generator";

export interface PollResult {
  accountsChecked: number;
  newTweetsFound: number;
  repliesGenerated: number;
  repliesPosted: number;
  errors: string[];
}

/**
 * Polls all enabled watched accounts for new tweets and generates auto-replies.
 * For "auto" mode accounts: generates and posts immediately.
 * For "manual" mode accounts: generates and saves as pending for user approval.
 */
export async function pollWatchedAccounts(): Promise<PollResult> {
  const result: PollResult = {
    accountsChecked: 0,
    newTweetsFound: 0,
    repliesGenerated: 0,
    repliesPosted: 0,
    errors: [],
  };

  // Get all enabled watched accounts grouped by user
  const accounts = await prisma.watchedAccount.findMany({
    where: { isEnabled: true },
    include: {
      user: {
        select: { id: true },
      },
    },
  });

  // Group by userId
  const byUser = new Map<string, typeof accounts>();
  for (const account of accounts) {
    const userId = account.userId;
    if (!byUser.has(userId)) byUser.set(userId, []);
    byUser.get(userId)!.push(account);
  }

  for (const [userId, userAccounts] of byUser) {
    let accessToken: string;
    try {
      accessToken = await getValidAccessToken(userId);
    } catch (err) {
      result.errors.push(
        `User ${userId}: ${err instanceof Error ? err.message : "Token error"}`
      );
      continue;
    }

    for (const account of userAccounts) {
      result.accountsChecked++;

      if (!account.accountId) {
        result.errors.push(
          `@${account.accountHandle}: No account ID stored, skipping`
        );
        continue;
      }

      try {
        // Fetch new tweets since last check
        const tweets = await getAccountRecentTweets(
          accessToken,
          account.accountId,
          account.lastCheckedTweetId ?? undefined
        );

        if (tweets.length === 0) continue;

        result.newTweetsFound += tweets.length;

        // Update lastCheckedTweetId to the newest tweet
        const newestTweetId = tweets[0].id;
        await prisma.watchedAccount.update({
          where: { id: account.id },
          data: { lastCheckedTweetId: newestTweetId },
        });

        // Generate and handle replies for each new tweet
        for (const tweet of tweets) {
          try {
            if (account.replyType === "video") {
              // For video replies, queue a pending log entry.
              // The Popcorn video generation and posting flow can hook into these logs.
              result.repliesGenerated++;

              await prisma.autoReplyLog.create({
                data: {
                  userId,
                  watchedAccountId: account.id,
                  targetTweetId: tweet.id,
                  targetTweetText: tweet.text,
                  targetAuthor: account.accountHandle,
                  replyContent: "",
                  replyType: "video",
                  status: "pending",
                },
              });
            } else {
              // Text-based reply: generate using the existing content generator
              const generated = await generateContent(
                {
                  platform: "x",
                  postType: "reply",
                  targetPostContent: tweet.text,
                  targetAuthor: account.accountHandle,
                  count: 1,
                },
                userId
              );

              if (!generated.length) continue;

              const replyContent = generated[0].content;
              result.repliesGenerated++;

              if (account.replyMode === "auto") {
                // Auto mode: post immediately
                try {
                  const posted = await postTweet(
                    accessToken,
                    replyContent,
                    tweet.id
                  );

                  await prisma.autoReplyLog.create({
                    data: {
                      userId,
                      watchedAccountId: account.id,
                      targetTweetId: tweet.id,
                      targetTweetText: tweet.text,
                      targetAuthor: account.accountHandle,
                      replyContent,
                      replyType: "text",
                      replyTweetId: posted.id,
                      status: "posted",
                      postedAt: new Date(),
                    },
                  });

                  // Also record in post history
                  await prisma.postHistory.create({
                    data: {
                      userId,
                      platform: "x",
                      postType: "reply",
                      content: replyContent,
                      targetPostId: tweet.id,
                      targetAuthor: account.accountHandle,
                      platformPostId: posted.id,
                    },
                  });

                  result.repliesPosted++;
                } catch (postErr) {
                  // Log as failed if posting fails
                  await prisma.autoReplyLog.create({
                    data: {
                      userId,
                      watchedAccountId: account.id,
                      targetTweetId: tweet.id,
                      targetTweetText: tweet.text,
                      targetAuthor: account.accountHandle,
                      replyContent,
                      replyType: "text",
                      status: "failed",
                    },
                  });
                  result.errors.push(
                    `@${account.accountHandle}: Failed to post reply - ${postErr instanceof Error ? postErr.message : "unknown"}`
                  );
                }
              } else {
                // Manual mode: save as pending
                await prisma.autoReplyLog.create({
                  data: {
                    userId,
                    watchedAccountId: account.id,
                    targetTweetId: tweet.id,
                    targetTweetText: tweet.text,
                    targetAuthor: account.accountHandle,
                    replyContent,
                    replyType: "text",
                    status: "pending",
                  },
                });
              }
            }
          } catch (genErr) {
            result.errors.push(
              `@${account.accountHandle}: Reply generation failed - ${genErr instanceof Error ? genErr.message : "unknown"}`
            );
          }
        }
      } catch (err) {
        result.errors.push(
          `@${account.accountHandle}: ${err instanceof Error ? err.message : "Fetch error"}`
        );
      }
    }
  }

  return result;
}
