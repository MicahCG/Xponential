import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";
import { prisma } from "@/lib/prisma";
import type { Platform, PostType } from "@prisma/client";

interface PostWithMetrics {
  id: string;
  content: string;
  postType: PostType;
  postedAt: Date;
  targetAuthor: string | null;
  targetPostContent: string | null;
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

const ANALYSIS_SYSTEM_PROMPT = `You are a social media performance analyst specializing in voice-driven content. You will be given a list of posts made by a user over the past week, along with their engagement metrics. Your job is to:

1. Find patterns in what performed well vs poorly, be specific and reference actual content
2. Generate hypotheses about WHY certain posts did better (style, structure, topic, tone)
3. Give concrete, actionable guidance that this specific person can apply going forward

Be specific and data-driven. Reference actual numbers and quote actual phrases that worked.
Separate your analysis by post type where relevant (replies behave differently than originals).

Analyze these dimensions:
- Length: shorter vs longer, where brevity won vs detail won
- Tone: witty/ironic vs informative vs agreeable vs provocative, which resonated
- Opening hook: what first lines drove more reads
- Reply strategy: what angles get replies vs just likes. When the original tweet is available, analyze how the reply related to the original — did it add a novel angle, agree and amplify, challenge, add humor, reframe? Which reply-to-original relationships drove the most engagement?
- Reply context: which types of original tweets (announcements, opinions, questions, hot takes) were best to reply to, and what made the reply stand out in that context
- Format: questions vs statements vs observations
- Content type: original takes vs replies vs quotes, which drives more engagement for this user
- Emoji use: did it help or hurt for this person
- Specific phrases, hooks, or structures that appear in the best performers
- Punctuation: flag any use of em dashes or en dashes as a pattern to avoid (the user never wants these)
- FORMAT REPETITION: If multiple posts use the same sentence template or structure (e.g., "[name] just discovered that [X]"), flag this as a HIGH CONFIDENCE issue. Repetitive formatting kills authenticity and makes the account look automated. Always recommend structural variety

Focus your actionable guidance on maximizing likes, retweets, and replies. The goal is engagement growth. Prioritize insights about what makes content witty, informative, and insightful over generic style observations.`;

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
      const contextLine =
        p.postType === "reply" && p.targetPostContent
          ? `\nOriginal tweet by @${p.targetAuthor ?? "unknown"}: "${p.targetPostContent}"\nReply: `
          : p.postType === "reply" && p.targetAuthor
            ? `\nReplying to @${p.targetAuthor}: `
            : "";
      return `Post ${i + 1} [${p.postType}] (posted ${hour}:00, score: ${score}):${contextLine}
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

  const userPrompt = `Here are ${posts.length} posts from the past 7 days on ${platform}, ranked by their engagement score (highest first):

${postsText}

Analyze these posts and identify patterns in what drove engagement vs what didn't. Be specific — quote actual phrases, reference actual numbers, and distinguish between replies and original posts where relevant. Generate actionable insights this person can apply immediately.`;

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2000,
    system: ANALYSIS_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
    tools: [
      {
        name: "submit_analysis",
        description: "Submit the performance analysis and insights",
        input_schema: INSIGHTS_SCHEMA,
      },
    ],
    tool_choice: { type: "tool", name: "submit_analysis" },
  });

  const toolBlock = response.content.find((b) => b.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") return null;

  const parsed = toolBlock.input as {
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

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const analysisDate = new Date();
  analysisDate.setHours(0, 0, 0, 0);

  // Get all posts from last 7 days that have metrics
  const posts = await prisma.postHistory.findMany({
    where: {
      postedAt: { gte: sevenDaysAgo },
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
      targetPostContent: true,
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
      targetPostContent: post.targetPostContent,
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
