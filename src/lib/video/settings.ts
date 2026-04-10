import { prisma } from "@/lib/prisma";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";
import type { VideoDuration, VideoOrientation, VideoQuality } from "./popcorn";

export interface VideoSettings {
  popcornUserId: string | null;
  style: string;
  quality: VideoQuality;
  duration: VideoDuration;
  orientation: VideoOrientation;
  promptTemplate: string;
}

const DEFAULTS: Omit<VideoSettings, "popcornUserId"> = {
  style: "muppet",
  quality: "budget",
  duration: "15",
  orientation: "vertical",
  promptTemplate: "Create a video based off this tweet {tweet_url}",
};

export async function getVideoSettings(userId: string): Promise<VideoSettings> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { settings: true },
  });
  const s = (user?.settings ?? {}) as Record<string, unknown>;

  return {
    popcornUserId:  (s.popcornUserId as string)       ?? null,
    style:          (s.videoStyle as string)           ?? DEFAULTS.style,
    quality:        (s.videoQuality as VideoQuality)   ?? DEFAULTS.quality,
    duration:       (s.videoDuration as VideoDuration) ?? DEFAULTS.duration,
    orientation:    (s.videoOrientation as VideoOrientation) ?? DEFAULTS.orientation,
    promptTemplate: (s.videoPromptTemplate as string)  ?? DEFAULTS.promptTemplate,
  };
}

export function buildPrompt(template: string, targetAuthor: string, targetTweetId: string): string {
  const tweetUrl = `https://x.com/${targetAuthor}/status/${targetTweetId}`;
  return template.replace("{tweet_url}", tweetUrl);
}

const VIDEO_PROMPT_SYSTEM = `You are a creative director for short-form video content on social media. Given a tweet that someone is replying to, you generate a vivid, specific prompt for an AI video generator (Popcorn) that will create a short video to accompany the reply.

Your job is to choose the best video concept that will:
1. Be contextually relevant to the tweet's topic and tone
2. Be visually engaging and attention-grabbing in a social feed
3. Complement the reply text (if provided) or stand on its own as a reaction
4. Maximize engagement: funny, surprising, or visually striking videos get more likes

Rules:
- Write a single, clear video generation prompt (1-3 sentences)
- Be specific about visuals: describe scenes, characters, actions, mood, and style
- Match the energy of the tweet: serious tweets get thoughtful visuals, funny tweets get humorous visuals
- Include the tweet URL for context: {tweet_url}
- Think about what would make someone stop scrolling and watch`;

const VIDEO_PROMPT_SCHEMA = {
  type: "object" as const,
  properties: {
    videoPrompt: {
      type: "string" as const,
      description: "The video generation prompt for Popcorn",
    },
    reasoning: {
      type: "string" as const,
      description: "Brief explanation of why this video concept fits the tweet",
    },
  },
  required: ["videoPrompt", "reasoning"],
};

/**
 * Generate a dynamic, context-aware video prompt based on the tweet content
 * instead of using a static template. Falls back to the static template on error.
 */
export async function generateDynamicVideoPrompt(params: {
  tweetText: string;
  targetAuthor: string;
  targetTweetId: string;
  replyCaption?: string;
  style: string;
  duration: VideoDuration;
  fallbackTemplate: string;
}): Promise<string> {
  const tweetUrl = `https://x.com/${params.targetAuthor}/status/${params.targetTweetId}`;

  try {
    const userPrompt = `Tweet by @${params.targetAuthor}:
"${params.tweetText}"

${params.replyCaption ? `Reply caption that will accompany the video:\n"${params.replyCaption}"\n` : ""}
Video style: ${params.style}
Video duration: ${params.duration} seconds
Tweet URL: ${tweetUrl}

Generate the best video prompt for this context.`;

    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 500,
      system: VIDEO_PROMPT_SYSTEM.replace("{tweet_url}", tweetUrl),
      messages: [{ role: "user", content: userPrompt }],
      tools: [
        {
          name: "submit_video_prompt",
          description: "Submit the generated video prompt",
          input_schema: VIDEO_PROMPT_SCHEMA,
        },
      ],
      tool_choice: { type: "tool", name: "submit_video_prompt" },
    });

    const toolBlock = response.content.find((b) => b.type === "tool_use");
    if (!toolBlock || toolBlock.type !== "tool_use") {
      throw new Error("No tool use block in response");
    }

    const parsed = toolBlock.input as {
      videoPrompt: string;
      reasoning: string;
    };

    console.log(
      `[VideoSettings] Dynamic prompt generated for @${params.targetAuthor}: "${parsed.videoPrompt.slice(0, 100)}..." (reason: ${parsed.reasoning})`
    );

    return parsed.videoPrompt;
  } catch (err) {
    console.warn(
      `[VideoSettings] Dynamic prompt generation failed, falling back to template:`,
      err
    );
    return buildPrompt(params.fallbackTemplate, params.targetAuthor, params.targetTweetId);
  }
}
