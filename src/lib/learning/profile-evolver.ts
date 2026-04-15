import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";
import { prisma } from "@/lib/prisma";
import type { Platform } from "@prisma/client";
import type { FeedbackExample } from "@/lib/content/prompts";

interface ScoredPost {
  content: string;
  postType: string;
  targetAuthor: string | null;
  targetPostContent: string | null;
  score: number;
  engagementRate: number;
  likes: number;
  retweets: number;
  replies: number;
  impressions: number;
}

const EVOLVER_SYSTEM_PROMPT = `You are an expert social media coach studying a user's actual post performance data to help them compound their results over time.

You will receive their best and worst performing posts from the past 30 days plus their current writing instructions.

Your job is to:
1. Identify the specific writing patterns, hooks, and structures that drove high engagement
2. For replies where the original tweet is provided, analyze the reply-to-original relationship: what angle did the reply take (novel insight, humor, reframe, amplify, challenge)? Which types of original tweets were best to reply to?
3. Identify what patterns consistently underperformed
4. Write evolved reply instructions that incorporate these real-world findings, including guidance on which reply angles and tweet types to target
5. Select 3-5 "do this" examples from their best posts and 2-3 "avoid this" patterns from their worst

Rules:
- The evolved instructions MUST preserve any explicit preferences from the current instructions (tone, language, topics to avoid, etc.)
- Add new data-driven guidance ON TOP of existing preferences, never contradict them
- Examples must come directly from their actual posts, not invented
- Be specific: "start with a short punchy hook" is better than "be engaging"
- Focus on what makes REPLIES perform well specifically, not just general posts
- ALWAYS include this rule in evolved instructions: never use em dashes or en dashes. Use commas, periods, colons, or restructure the sentence instead
- Evolved instructions should push toward witty, informative, and insightful content that maximizes likes and engagement
- Prioritize actionable patterns: what specific hooks, structures, and tones drove the most interaction

CRITICAL — PREVENT FORMAT REPETITION:
- If the top-performing posts all share the same sentence template or structure (e.g., "[name] just discovered that [X] costs less than [Y]"), flag this as a MODE COLLAPSE problem. One repeating format signals staleness, not a winning formula.
- Evolved instructions MUST explicitly require structural variety: questions, observations, analogies, metaphors, dry humor, hypotheticals, callbacks, short punchy takes, etc.
- "Do this" examples should showcase DIVERSE formats that worked, not 3-5 examples of the same template. If only one format performed well, include it once and instruct the user to develop new formats for the remaining examples.
- Never let evolved instructions prescribe a single sentence template to follow repeatedly`;

function computeScore(engagement: Record<string, number>): {
  score: number;
  engagementRate: number;
} {
  const likes = engagement.likes ?? 0;
  const retweets = engagement.retweets ?? 0;
  const replies = engagement.replies ?? 0;
  const impressions = engagement.impressions ?? 0;
  const bookmarks = engagement.bookmarks ?? 0;
  const score =
    likes * 3 + retweets * 5 + replies * 4 + bookmarks * 2 + impressions * 0.01;
  const engagementRate =
    impressions > 0
      ? ((likes + retweets + replies + bookmarks) / impressions) * 100
      : 0;
  return { score, engagementRate };
}

function formatPosts(posts: ScoredPost[]): string {
  return posts
    .map((p, i) => {
      const contextLine =
        p.postType === "reply" && p.targetPostContent
          ? `   Original tweet by @${p.targetAuthor ?? "unknown"}: "${p.targetPostContent}"\n`
          : p.postType === "reply" && p.targetAuthor
            ? `   Replying to @${p.targetAuthor}\n`
            : "";
      return (
        `${i + 1}. [${p.postType}] score: ${p.score.toFixed(0)}, engagement rate: ${p.engagementRate.toFixed(2)}%\n` +
        contextLine +
        `   "${p.content}"\n` +
        `   (${p.likes} likes · ${p.retweets} RTs · ${p.replies} replies · ${p.impressions} impressions)`
      );
    })
    .join("\n\n");
}

const EVOLUTION_SCHEMA = {
  type: "object" as const,
  properties: {
    evolvedInstructions: {
      type: "string" as const,
      description:
        "Updated reply instructions (3-6 sentences). Must include existing preferences plus new data-driven learnings.",
    },
    doExamples: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          text: {
            type: "string" as const,
            description: "The actual post content (verbatim from their best posts)",
          },
          note: {
            type: "string" as const,
            description: "Why this worked — the specific pattern to emulate",
          },
        },
        required: ["text", "note"],
      },
    },
    dontExamples: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          text: {
            type: "string" as const,
            description: "The actual post content or a pattern to avoid",
          },
          note: {
            type: "string" as const,
            description: "Why this underperformed — the specific pattern to avoid",
          },
        },
        required: ["text", "note"],
      },
    },
  },
  required: ["evolvedInstructions", "doExamples", "dontExamples"],
};

async function evolveUserProfile(params: {
  userId: string;
  platform: Platform;
  bestPosts: ScoredPost[];
  worstPosts: ScoredPost[];
  currentInstructions: string | null;
  existingExamples: FeedbackExample[] | null;
}): Promise<{ replyInstructions: string; feedbackExamples: FeedbackExample[] } | null> {
  const prompt = `User's posts on ${params.platform} — past 30 days.

BEST PERFORMING POSTS (top 5 by engagement):
${formatPosts(params.bestPosts)}

WORST PERFORMING POSTS (bottom 3 by engagement):
${formatPosts(params.worstPosts)}

CURRENT REPLY INSTRUCTIONS:
${params.currentInstructions || "(none set — derive from scratch based on what's working)"}

Generate evolved instructions and examples based on the actual performance data above.`;

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1500,
    system: EVOLVER_SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
    tools: [
      {
        name: "submit_evolution",
        description: "Submit the evolved profile",
        input_schema: EVOLUTION_SCHEMA,
      },
    ],
    tool_choice: { type: "tool", name: "submit_evolution" },
  });

  const toolBlock = response.content.find((b) => b.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") return null;

  const parsed = toolBlock.input as {
    evolvedInstructions: string;
    doExamples: { text: string; note: string }[];
    dontExamples: { text: string; note: string }[];
  };

  // Keep manually-added examples that have a URL (user explicitly saved them)
  const manualExamples = (params.existingExamples ?? []).filter((e) => e.url);

  const aiDos: FeedbackExample[] = parsed.doExamples
    .slice(0, 5)
    .map((e) => ({ type: "do" as const, text: e.text, note: e.note }));
  const aiDonts: FeedbackExample[] = parsed.dontExamples
    .slice(0, 3)
    .map((e) => ({ type: "dont" as const, text: e.text, note: e.note }));

  // Merge: AI-generated first (most recent data), then manual ones
  const merged: FeedbackExample[] = [
    ...aiDos,
    ...aiDonts,
    ...manualExamples,
  ].slice(0, 12);

  return {
    replyInstructions: parsed.evolvedInstructions,
    feedbackExamples: merged,
  };
}

export interface ProfileEvolutionResult {
  usersProcessed: number;
  profilesUpdated: number;
  skipped: number;
  errors: string[];
}

/**
 * Weekly job: synthesizes 30 days of post performance into evolved
 * replyInstructions and feedbackExamples on the active personality profile.
 * This makes learning permanent and compounds over time.
 */
export async function evolveProfiles(
  platform: Platform = "x"
): Promise<ProfileEvolutionResult> {
  const result: ProfileEvolutionResult = {
    usersProcessed: 0,
    profilesUpdated: 0,
    skipped: 0,
    errors: [],
  };

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const posts = await prisma.postHistory.findMany({
    where: {
      platform,
      metricsUpdatedAt: { not: null },
      postedAt: { gte: cutoff },
    },
    select: {
      userId: true,
      content: true,
      postType: true,
      targetAuthor: true,
      targetPostContent: true,
      engagement: true,
    },
  });

  if (posts.length === 0) return result;

  // Group by userId
  const byUser = new Map<string, typeof posts>();
  for (const post of posts) {
    if (!byUser.has(post.userId)) byUser.set(post.userId, []);
    byUser.get(post.userId)!.push(post);
  }

  for (const [userId, userPosts] of byUser) {
    result.usersProcessed++;

    if (userPosts.length < 5) {
      result.skipped++;
      continue; // Not enough data to learn from
    }

    try {
      const scored: ScoredPost[] = userPosts.map((p) => {
        const e = p.engagement as Record<string, number>;
        const { score, engagementRate } = computeScore(e);
        return {
          content: p.content,
          postType: p.postType,
          targetAuthor: p.targetAuthor,
          targetPostContent: p.targetPostContent,
          score,
          engagementRate,
          likes: e.likes ?? 0,
          retweets: e.retweets ?? 0,
          replies: e.replies ?? 0,
          impressions: e.impressions ?? 0,
        };
      });

      const sorted = scored.sort((a, b) => b.score - a.score);
      const bestPosts = sorted.slice(0, 5);
      const worstPosts = sorted.slice(-3);

      // Skip if the best posts have essentially no engagement (new/inactive accounts)
      if (bestPosts[0].score < 2) {
        result.skipped++;
        continue;
      }

      const profile = await prisma.personalityProfile.findFirst({
        where: { userId, isActive: true },
        select: { id: true, replyInstructions: true, feedbackExamples: true },
      });

      if (!profile) {
        result.skipped++;
        continue;
      }

      const evolved = await evolveUserProfile({
        userId,
        platform,
        bestPosts,
        worstPosts,
        currentInstructions: profile.replyInstructions,
        existingExamples: profile.feedbackExamples as FeedbackExample[] | null,
      });

      if (!evolved) continue;

      await prisma.personalityProfile.update({
        where: { id: profile.id },
        data: {
          replyInstructions: evolved.replyInstructions,
          feedbackExamples: evolved.feedbackExamples as object[],
        },
      });

      result.profilesUpdated++;
    } catch (err) {
      result.errors.push(
        `User ${userId}: ${err instanceof Error ? err.message : "Evolution failed"}`
      );
    }
  }

  return result;
}
