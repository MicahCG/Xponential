import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ingestFullProfile } from "@/lib/personality/scraper";
import { analyzePersonality } from "@/lib/personality/analyzer";
import { getAccountRecommendations } from "@/lib/personality/recommender";
import { getValidAccessToken, getUsersByUsernames } from "@/lib/platform/x-client";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    // Step 1: Ingest full profile data from X
    const ingestedData = await ingestFullProfile(userId);

    const totalContent =
      ingestedData.originalTweets.length + ingestedData.replies.length;
    if (totalContent < 5) {
      return NextResponse.json(
        {
          error:
            "Not enough content found. You need at least 5 tweets or replies for analysis.",
        },
        { status: 400 }
      );
    }

    // Step 2: Analyze personality with full ingested data
    const profile = await analyzePersonality({
      method: "ingest",
      ingestedData,
    });

    // Step 3: Deactivate existing profiles and save new one
    await prisma.personalityProfile.updateMany({
      where: { userId: userId, isActive: true },
      data: { isActive: false },
    });

    const saved = await prisma.personalityProfile.create({
      data: {
        userId: userId,
        method: "ingest",
        rawInput: JSON.parse(
          JSON.stringify({
            tweetCount: ingestedData.originalTweets.length,
            replyCount: ingestedData.replies.length,
            likedCount: ingestedData.likedTweets.length,
            followingCount: ingestedData.following.length,
          })
        ),
        profileData: JSON.parse(JSON.stringify(profile)),
      },
    });

    // Step 4: Get account recommendations
    const { engagedAccounts, recommendedAccounts } =
      await getAccountRecommendations(ingestedData);

    // Step 4b: Fetch follower counts for engaged accounts missing them
    // (engaged accounts the user replied to but doesn't follow won't have counts)
    const missingFollowers = engagedAccounts.filter(
      (a) => a.followersCount == null
    );
    if (missingFollowers.length > 0) {
      try {
        const accessToken = await getValidAccessToken(userId);
        const userData = await getUsersByUsernames(
          accessToken,
          missingFollowers.map((a) => a.username)
        );
        const followerMap = new Map(
          userData.map((u) => [u.username.toLowerCase(), u.followersCount])
        );
        for (const account of engagedAccounts) {
          if (account.followersCount == null) {
            const count = followerMap.get(account.username.toLowerCase());
            if (count != null) account.followersCount = count;
          }
        }
      } catch (err) {
        console.warn("Could not fetch follower counts for engaged accounts:", err);
      }
    }

    // Step 5: Save watched accounts to database (upsert to avoid duplicates)
    const allAccounts = [
      ...engagedAccounts.map((a) => ({
        userId: userId,
        platform: "x" as const,
        accountHandle: a.username,
        followersCount: a.followersCount ?? null,
        isRecommended: false,
        isEnabled: false,
        replyCount: a.replyCount,
        category: a.category ?? null,
      })),
      ...recommendedAccounts.map((a) => ({
        userId: userId,
        platform: "x" as const,
        accountHandle: a.username,
        followersCount: a.followersCount ?? null,
        isRecommended: true,
        isEnabled: false,
        replyCount: 0,
        category: a.category ?? null,
      })),
    ];

    for (const account of allAccounts) {
      await prisma.watchedAccount.upsert({
        where: {
          userId_platform_accountHandle: {
            userId: account.userId,
            platform: account.platform,
            accountHandle: account.accountHandle,
          },
        },
        create: account,
        update: {
          followersCount: account.followersCount,
          replyCount: account.replyCount,
          category: account.category,
          isRecommended: account.isRecommended,
        },
      });
    }

    return NextResponse.json({
      id: saved.id,
      profile,
      stats: {
        tweetsAnalyzed: ingestedData.originalTweets.length,
        repliesAnalyzed: ingestedData.replies.length,
        likedTweetsAnalyzed: ingestedData.likedTweets.length,
        followingAnalyzed: ingestedData.following.length,
      },
      engagedAccounts: engagedAccounts.map((a) => ({
        username: a.username,
        name: a.name,
        followersCount: a.followersCount,
        replyCount: a.replyCount,
        category: a.category,
      })),
      recommendedAccounts: recommendedAccounts.map((a) => ({
        username: a.username,
        name: a.name,
        followersCount: a.followersCount,
        category: a.category,
      })),
    });
  } catch (error) {
    console.error("Profile ingestion error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to ingest profile",
      },
      { status: 500 }
    );
  }
}
