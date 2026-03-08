import { openai } from "@/lib/openai";
import { prisma } from "@/lib/prisma";
import type { Platform, PostType } from "@prisma/client";

interface PostWithMetrics {
  id: string;
  content: string;
  postType: PostType;
  postedAt: Date;
  targetAuthor: string | null;
  engagement: {
    likes: number;
    retweets: number;
    replies: number;
    impressions: number;
    bookmarks: number;
  };
}

export interface LearningInsight {
  category: "length" | "tone" | "timing" | "format" | "content" | "other";
  finding: string;
  hypothesis: string;
  actionable: string;
  confidence: "high" | "medium" | "low";
}

export interface DailyLearningResult {
  usersProcessed: number;
  learningsSaved: number;
  errors: string[];
}

const ANALYSIS_SYSTEM_PROMPT = `You are a social media performance analyst. You will be given a list of posts made by a user on a given day, along with their engagement metrics. Your job is to:

1. Find patterns in what performed well vs poorly
2. Generate hypotheses about WHY certain posts did better
3. Give concrete, actionable guidance for future posts

Be specific and data-driven. Reference actual numbers. Think like a growth strategist.

Analyze these dimensions when relevant:
- Length: shorter vs longer posts
- Tone: witty/ironic vs informative vs agreeable vs provocative
- Format: questions vs statements vs lists
- Timing: time of day
- Content type: original takes vs replies vs quotes
- Emoji use: posts with vs without
- Style: specific phrases, hooks, openers that worked`;

function computeEngagementScore(e: PostWithMetrics["engagement"]): number {
  // Weighted score: impressions matter less than direct interactions
  return e.likes * 3 + e.retweets * 5 + e.replies * 4 + e.bookmarks * 2 + e.impressions * 0.01;
}

function formatPostsForAnalysis(posts: PostWithMetrics[]): string {
  return posts
    .map((p, i) => {
      const e = p.engagement;
      const score = computeEngagementScore(e).toFixed(1);
      const hour = p.postedAt.getHours();
      return `Post ${i + 1} [${p.postType}] (posted ${hour}:00, score: ${score}):
"${p.content}"
Metrics: ${e.likes} likes, ${e.retweets} retweets, ${e.replies} replies, ${e.impressions} impressions, ${e.bookmarks} bookmarks`;
    })
    .join("\n\n");
}

const INSIGHTS_SCHEMA = {
  type: "object" as const,
  properties: {
    insights: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          category: {
            type: "string" as const,
            enum: ["length", "tone", "timing", "format", "content", "other"],
          },
          finding: { type: "string" as const },
          hypothesis: { type: "string" as const },
          actionable: { type: "string" as const },
          confidence: { type: "string" as const, enum: ["high", "medium", "low"] },
        },
        required: ["category", "finding", "hypothesis", "actionable", "confidence"],
      },
    },
    topPerformer: {
      type: "object" as const,
      properties: {
        postIndex: { type: "number" as const },
        whyItWorked: { type: "string" as const },
      },
      required: ["postIndex", "whyItWorked"],
    },
    bottomPerformer: {
      type: "object" as const,
      properties: {
        postIndex: { type: "number" as const },
        whyItDidntWork: { type: "string" as const },
      },
      required: ["postIndex", "whyItDidntWork"],
    },
    summary: { type: "string" as const },
  },
  required: ["insights", "summary"],
};

async function analyzeUserPosts(
  userId: string,
  platform: Platform,
  posts: PostWithMetrics[]
): Promise<{ insights: LearningInsight[]; rawAnalysis: string } | null> {
  if (posts.length < 2) return null; // Not enough data to compare

  const postsText = formatPostsForAnalysis(posts);

  const userPrompt = `Here are ${posts.length} posts from yesterday on ${platform}, ranked by their engagement:

${postsText}

Analyze these posts and identify patterns in what drove engagement vs what didn't. Generate specific, actionable insights.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 2000,
    messages: [
      { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "submit_analysis",
          description: "Submit the performance analysis and insights",
          parameters: INSIGHTS_SCHEMA,
        },
      },
    ],
    tool_choice: { type: "function", function: { name: "submit_analysis" } },
  });

  const toolCall = response.choices[0]?.message?.tool_calls?.[0];
  if (!toolCall || toolCall.type !== "function") return null;

  const parsed = JSON.parse(toolCall.function.arguments) as {
    insights: LearningInsight[];
    summary: string;
  };

  return {
    insights: parsed.insights,
    rawAnalysis: parsed.summary,
  };
}

/**
 * Runs daily learning analysis for all users.
 * Looks at posts from the last 24h with engagement metrics and generates insights.
 */
export async function runDailyLearning(): Promise<DailyLearningResult> {
  const result: DailyLearningResult = {
    usersProcessed: 0,
    learningsSaved: 0,
    errors: [],
  };

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const today = new Date();
  const analysisDate = new Date(yesterday);
  analysisDate.setHours(0, 0, 0, 0);

  // Get all posts from last 24h that have metrics
  const posts = await prisma.postHistory.findMany({
    where: {
      postedAt: { gte: yesterday },
      metricsUpdatedAt: { not: null },
    },
    select: {
      id: true,
      userId: true,
      platform: true,
      postType: true,
      content: true,
      postedAt: true,
      targetAuthor: true,
      engagement: true,
    },
  });

  if (posts.length === 0) return result;

  // Group by userId + platform
  const byUserPlatform = new Map<string, { userId: string; platform: Platform; posts: PostWithMetrics[] }>();

  for (const post of posts) {
    const key = `${post.userId}:${post.platform}`;
    if (!byUserPlatform.has(key)) {
      byUserPlatform.set(key, { userId: post.userId, platform: post.platform, posts: [] });
    }

    const engagement = post.engagement as Record<string, number>;
    byUserPlatform.get(key)!.posts.push({
      id: post.id,
      content: post.content,
      postType: post.postType,
      postedAt: post.postedAt,
      targetAuthor: post.targetAuthor,
      engagement: {
        likes: engagement.likes ?? 0,
        retweets: engagement.retweets ?? 0,
        replies: engagement.replies ?? 0,
        impressions: engagement.impressions ?? 0,
        bookmarks: engagement.bookmarks ?? 0,
      },
    });
  }

  for (const { userId, platform, posts: userPosts } of byUserPlatform.values()) {
    result.usersProcessed++;

    // Sort by engagement score descending for the prompt
    const sorted = [...userPosts].sort(
      (a, b) => computeEngagementScore(b.engagement) - computeEngagementScore(a.engagement)
    );

    try {
      const analysis = await analyzeUserPosts(userId, platform, sorted);
      if (!analysis) continue;

      // Upsert: one record per user/platform/day
      await prisma.contentLearning.upsert({
        where: {
          userId_platform_date: { userId, platform, date: analysisDate },
        },
        update: {
          insights: analysis.insights as object[],
          rawAnalysis: analysis.rawAnalysis,
          postsAnalyzed: sorted.length,
        },
        create: {
          userId,
          platform,
          date: analysisDate,
          insights: analysis.insights as object[],
          rawAnalysis: analysis.rawAnalysis,
          postsAnalyzed: sorted.length,
        },
      });

      result.learningsSaved++;
    } catch (err) {
      result.errors.push(
        `User ${userId} (${platform}): ${err instanceof Error ? err.message : "Analysis failed"}`
      );
    }
  }

  return result;
}
