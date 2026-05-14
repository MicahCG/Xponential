import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchXTrending } from "@/lib/platform/x-trending";
import { postTweetViaApify } from "@/lib/platform/apify-poster";
import { generateOriginalDraft } from "@/lib/auto-original/generator";
import {
  scoreOriginalDraft,
  decideOriginalFromScore,
} from "@/lib/auto-original/quality-gate";
import type { PersonalityProfile } from "@/lib/personality/types";

interface RouteResult {
  connectionsChecked: number;
  draftsGenerated: number;
  draftsQueued: number;
  draftsPosted: number;
  draftsSkippedByGate: number;
  errors: string[];
  debug: string[];
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result: RouteResult = {
    connectionsChecked: 0,
    draftsGenerated: 0,
    draftsQueued: 0,
    draftsPosted: 0,
    draftsSkippedByGate: 0,
    errors: [],
    debug: [],
  };

  // Active-hours guard: 9am–8pm ET
  const now = new Date();
  const etHour = parseInt(
    now.toLocaleString("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hour12: false,
    })
  );
  if (etHour < 9 || etHour >= 20) {
    result.debug.push(`Outside active hours (${etHour}:00 ET). Skipping.`);
    return NextResponse.json({ success: true, ...result });
  }

  const connections = await prisma.platformConnection.findMany({
    where: {
      platform: "x",
      status: "active",
      originalPostsEnabled: true,
    },
  });

  if (connections.length === 0) {
    result.debug.push("No X connections opted in to original posts.");
    return NextResponse.json({ success: true, ...result });
  }

  // Trending is shared across runs in this batch — fetch once
  const trending = await fetchXTrending({ limit: 25 });
  result.debug.push(`Fetched ${trending.length} trending topics`);

  const startOfTodayUtc = new Date();
  startOfTodayUtc.setUTCHours(0, 0, 0, 0);

  for (const connection of connections) {
    result.connectionsChecked++;
    const { id: connectionId, userId, brandId, accountHandle } = connection;
    const tag = `${accountHandle ?? userId}`;

    try {
      // Daily cap
      const todayCount = await prisma.postHistory.count({
        where: {
          brandId,
          platform: "x",
          postType: "original",
          postedAt: { gte: startOfTodayUtc },
        },
      });
      const pendingCount = await prisma.contentQueue.count({
        where: {
          brandId,
          platform: "x",
          postType: "original",
          status: "pending",
          createdAt: { gte: startOfTodayUtc },
        },
      });
      const usedToday = todayCount + pendingCount;
      if (usedToday >= connection.originalPostsPerDay) {
        result.debug.push(
          `${tag}: daily cap reached (${usedToday}/${connection.originalPostsPerDay})`
        );
        continue;
      }

      // Personality
      const personalityRow = await prisma.personalityProfile.findFirst({
        where: { brandId, isActive: true },
        select: { profileData: true, replyInstructions: true },
      });
      if (!personalityRow) {
        result.debug.push(`${tag}: no active personality profile — skipping`);
        continue;
      }
      const personality = personalityRow.profileData as unknown as PersonalityProfile;

      // Recent posts (for repeat avoidance)
      const recent = await prisma.postHistory.findMany({
        where: { brandId, platform: "x" },
        orderBy: { postedAt: "desc" },
        take: 8,
        select: { content: true },
      });

      // Generate draft
      const draft = await generateOriginalDraft({
        personality,
        replyInstructions: personalityRow.replyInstructions,
        trending,
        topicFocus: connection.originalPostsTopicFocus,
        recentOwnPosts: recent.map((r) => r.content),
      });
      result.draftsGenerated++;
      result.debug.push(
        `${tag}: draft (${draft.content.length}c) — topic="${draft.pickedTopic ?? "none"}"`
      );

      // Quality gate
      const score = await scoreOriginalDraft({
        draft: draft.content,
        personality,
        topicFocus: connection.originalPostsTopicFocus,
        recentOwnPosts: recent.map((r) => r.content),
      });
      const decision = decideOriginalFromScore(score);
      result.debug.push(
        `${tag}: gate ${decision.score} (threshold ${decision.threshold}) — ${decision.shouldPost ? "pass" : "skip"} [${decision.reasons.join("; ")}]`
      );
      if (!decision.shouldPost) {
        result.draftsSkippedByGate++;
        continue;
      }

      if (connection.originalPostsMode === "auto") {
        // Post immediately via Apify cookie actor
        try {
          const posted = await postTweetViaApify(
            userId,
            draft.content,
            undefined,
            undefined,
            connectionId
          );
          await prisma.postHistory.create({
            data: {
              userId,
              brandId,
              platform: "x",
              postType: "original",
              content: draft.content,
              platformPostId: posted.id,
            },
          });
          result.draftsPosted++;
          result.debug.push(`${tag}: posted ${posted.id}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "unknown";
          result.errors.push(`${tag}: post failed — ${msg}`);
          // Fall back: queue it so the user can still see/approve
          await prisma.contentQueue.create({
            data: {
              userId,
              brandId,
              platform: "x",
              postType: "original",
              content: draft.content,
              status: "pending",
            },
          });
          result.draftsQueued++;
        }
      } else {
        // Manual mode: queue for approval
        await prisma.contentQueue.create({
          data: {
            userId,
            brandId,
            platform: "x",
            postType: "original",
            content: draft.content,
            status: "pending",
          },
        });
        result.draftsQueued++;
        result.debug.push(`${tag}: queued for approval`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      result.errors.push(`${tag}: ${msg}`);
      console.error(`[x-original-posts] ${tag} error:`, err);
    }
  }

  return NextResponse.json({ success: true, ...result });
}
