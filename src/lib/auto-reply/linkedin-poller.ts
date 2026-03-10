import { prisma } from "@/lib/prisma";
import { scrapeLinkedInPosts } from "@/lib/platform/linkedin-scraper";
import { postLinkedInComment } from "@/lib/platform/linkedin-client";
import { generateContent } from "@/lib/content/generator";

export interface LinkedInPollResult {
  accountsChecked: number;
  newPostsFound: number;
  repliesGenerated: number;
  repliesPosted: number;
  errors: string[];
}

export async function pollLinkedInAccounts(): Promise<LinkedInPollResult> {
  const result: LinkedInPollResult = {
    accountsChecked: 0,
    newPostsFound: 0,
    repliesGenerated: 0,
    repliesPosted: 0,
    errors: [],
  };

  // Find all enabled LinkedIn watched profiles across all users
  const watchedProfiles = await prisma.watchedAccount.findMany({
    where: { platform: "linkedin", isEnabled: true },
    include: { user: { select: { id: true } } },
    take: 20,
  });

  for (const profile of watchedProfiles) {
    try {
      result.accountsChecked++;

      // Determine since when to scrape (last checked post date or 24h ago)
      const sinceDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const posts = await scrapeLinkedInPosts(
        profile.accountHandle, // stored as full profile URL
        5,
        sinceDate
      );

      // Filter to posts we haven't already replied to
      for (const post of posts) {
        // Skip if we already have a reply log for this post
        const existing = await prisma.autoReplyLog.findFirst({
          where: {
            userId: profile.userId,
            watchedAccountId: profile.id,
            targetTweetId: post.id,
          },
        });
        if (existing) continue;

        result.newPostsFound++;

        // Generate comment in user's voice
        let comment = "";
        try {
          const generated = await generateContent(
            {
              platform: "linkedin",
              postType: "reply",
              targetPostContent: post.text,
              targetAuthor: post.authorName,
              count: 1,
            },
            profile.userId
          );
          comment = generated[0]?.content ?? "";
        } catch (genErr) {
          console.warn(
            `[LinkedIn] Comment generation failed for ${post.id}:`,
            genErr
          );
          comment = "";
        }

        if (!comment) continue;

        const replyMode = profile.replyMode;

        if (replyMode === "auto") {
          // Post immediately via LinkedIn API
          try {
            const connection = await prisma.platformConnection.findUnique({
              where: {
                userId_platform: { userId: profile.userId, platform: "linkedin" },
              },
            });

            if (!connection || connection.status !== "active") {
              result.errors.push(`User ${profile.userId}: LinkedIn not connected`);
              continue;
            }

            const authorUrn = `urn:li:person:${connection.accountId}`;
            const posted = await postLinkedInComment(
              connection.accessToken,
              authorUrn,
              post.id,
              comment
            );

            await prisma.autoReplyLog.create({
              data: {
                userId: profile.userId,
                watchedAccountId: profile.id,
                targetTweetId: post.id,
                targetTweetText: post.text.slice(0, 500),
                targetAuthor: post.authorName,
                replyContent: comment,
                replyType: "text",
                replyTweetId: posted.id,
                status: "posted",
                postedAt: new Date(),
              },
            });

            await prisma.watchedAccount.update({
              where: { id: profile.id },
              data: { replyCount: { increment: 1 } },
            });

            result.repliesPosted++;
          } catch (postErr) {
            const msg =
              postErr instanceof Error ? postErr.message : "Unknown post error";
            await prisma.autoReplyLog.create({
              data: {
                userId: profile.userId,
                watchedAccountId: profile.id,
                targetTweetId: post.id,
                targetTweetText: post.text.slice(0, 500),
                targetAuthor: post.authorName,
                replyContent: comment,
                replyType: "text",
                status: "failed",
                errorMessage: msg,
              },
            });
            result.errors.push(`Post ${post.id}: ${msg}`);
          }
        } else {
          // Manual mode: save as pending for user approval
          await prisma.autoReplyLog.create({
            data: {
              userId: profile.userId,
              watchedAccountId: profile.id,
              targetTweetId: post.id,
              targetTweetText: post.text.slice(0, 500),
              targetAuthor: post.authorName,
              replyContent: comment,
              replyType: "text",
              status: "pending",
            },
          });
          result.repliesGenerated++;
        }
      }

      // Update lastCheckedTweetId to the newest post ID seen
      if (posts.length > 0) {
        await prisma.watchedAccount.update({
          where: { id: profile.id },
          data: { lastCheckedTweetId: posts[0].id },
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      result.errors.push(`Profile ${profile.accountHandle}: ${msg}`);
      console.error(`[LinkedIn poller] Error for ${profile.accountHandle}:`, err);
    }
  }

  return result;
}
