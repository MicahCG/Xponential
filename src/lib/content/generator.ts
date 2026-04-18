import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";
import { prisma } from "@/lib/prisma";
import type { PersonalityProfile } from "@/lib/personality/types";
import type { GenerateRequest, GeneratedContent } from "./types";
import {
  buildReplyPrompt,
  buildOriginalPostPrompt,
  buildQuotePrompt,
  type FeedbackExample,
} from "./prompts";
import { buildMemoryContext } from "./memory";
import { getRecentLearnings } from "@/lib/learning/injector";
import { DEFAULT_GENERATION_COUNT } from "@/lib/constants";

const GENERATION_SYSTEM_PROMPT = `You are a content generation engine for social media. Your job is to produce content that perfectly matches a given personality profile while maximizing engagement (likes, retweets, replies).

Rules:
- Every option must feel like it was written by the same person
- Never produce generic, corporate, or AI-sounding content
- Each option should take a different angle or approach
- Respect character limits strictly
- If the personality says "never" do something, don't do it
- NEVER use em dashes (—) or en dashes (–) anywhere in generated content. Use commas, periods, colons, or restructure the sentence instead
- Prioritize being witty, informative, and insightful. Replies should feel like they come from someone with genuine expertise or a sharp perspective
- Optimize for engagement: punchy hooks, strong takes, and conversational tone that invites interaction
- Avoid filler phrases, hedging language, and safe/bland observations. Every word should earn its place
- VARY YOUR FORMAT: Never reuse the same sentence template across multiple replies. If you see a pattern in the recent posts (e.g., "[name] just discovered that..."), do NOT use that pattern. Use diverse structures: questions, observations, analogies, dry one-liners, hypotheticals, callbacks, etc.
- NO SIGNATURE EMOJI: Never attach the same emoji to every reply. If recent posts repeatedly use one emoji (e.g., 💀, 😭, 😂, 🤡), that emoji is BANNED — it reads as spam. Default to zero emojis unless the personality explicitly calls for one, and never use an emoji as a separator mid-sentence between two observations.`;

const CONTENT_OPTIONS_SCHEMA = {
  type: "object" as const,
  properties: {
    options: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          content: {
            type: "string" as const,
            description: "The generated post content",
          },
          reasoning: {
            type: "string" as const,
            description:
              "Brief explanation of why this angle was chosen",
          },
        },
        required: ["content", "reasoning"],
      },
    },
  },
  required: ["options"],
};

async function getActiveProfile(
  userId: string,
  connectionId?: string
): Promise<{
  personality: PersonalityProfile;
  replyInstructions: string | null;
  feedbackExamples: FeedbackExample[] | null;
} | null> {
  const profile = await prisma.personalityProfile.findFirst({
    where: {
      userId,
      isActive: true,
      ...(connectionId && { platformConnectionId: connectionId }),
    },
    select: { profileData: true, replyInstructions: true, feedbackExamples: true },
  });

  if (!profile) return null;
  return {
    personality: profile.profileData as unknown as PersonalityProfile,
    replyInstructions: profile.replyInstructions,
    feedbackExamples: profile.feedbackExamples as FeedbackExample[] | null,
  };
}

export async function generateContent(
  request: GenerateRequest,
  userId: string,
  connectionId?: string
): Promise<GeneratedContent[]> {
  const activeProfile = await getActiveProfile(userId, connectionId);
  if (!activeProfile) {
    throw new Error(
      "No personality profile found. Set up your personality first."
    );
  }

  const { personality: profile, replyInstructions, feedbackExamples } = activeProfile;
  const count = request.count ?? DEFAULT_GENERATION_COUNT;
  const [memoryContext, learnings] = await Promise.all([
    buildMemoryContext(userId, request.platform, request.targetAuthor),
    getRecentLearnings(userId, request.platform),
  ]);

  let prompt: string;

  switch (request.postType) {
    case "reply":
      if (!request.targetPostContent) {
        throw new Error("Target post content is required for replies");
      }
      prompt = buildReplyPrompt({
        personality: profile,
        targetPost: request.targetPostContent,
        targetAuthor: request.targetAuthor ?? "unknown",
        recentPosts: memoryContext,
        platform: request.platform,
        count,
        replyInstructions,
        feedbackExamples,
        learnings,
      });
      break;

    case "quote":
      if (!request.targetPostContent) {
        throw new Error("Target post content is required for quotes");
      }
      prompt = buildQuotePrompt({
        personality: profile,
        targetPost: request.targetPostContent,
        targetAuthor: request.targetAuthor ?? "unknown",
        recentPosts: memoryContext,
        platform: request.platform,
        count,
        replyInstructions,
        feedbackExamples,
        learnings,
      });
      break;

    case "original":
      if (!request.topic) {
        throw new Error("Topic is required for original posts");
      }
      prompt = buildOriginalPostPrompt({
        personality: profile,
        topic: request.topic,
        recentPosts: memoryContext,
        platform: request.platform,
        count,
        additionalContext: request.additionalContext,
        replyInstructions,
        feedbackExamples,
        learnings,
      });
      break;
  }

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2000,
    system: GENERATION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
    tools: [
      {
        name: "submit_content_options",
        description: "Submit the generated content options",
        input_schema: CONTENT_OPTIONS_SCHEMA,
      },
    ],
    tool_choice: { type: "tool", name: "submit_content_options" },
  });

  const toolBlock = response.content.find((b) => b.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") {
    throw new Error("Failed to generate content");
  }

  const result = toolBlock.input as {
    options: { content: string; reasoning: string }[];
  };

  return result.options.map((opt) => ({
    content: opt.content,
    reasoning: opt.reasoning,
    platform: request.platform,
    postType: request.postType,
    characterCount: opt.content.length,
  }));
}
