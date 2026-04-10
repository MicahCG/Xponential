import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";
import type { AnalysisInput, PersonalityProfile } from "./types";
import { PERSONALITY_PROFILE_SCHEMA } from "./types";
import {
  formatTweetsForAnalysis,
  formatRepliesForAnalysis,
  formatLikedTweetsForAnalysis,
} from "./scraper";
import { formatQuizForAnalysis } from "./quiz";

const ANALYSIS_SYSTEM_PROMPT = `You are an expert at analyzing writing style and personality from social media content.

Your task is to build a comprehensive personality profile that captures the author's voice, tone, humor, and communication patterns. This profile will be used to generate content that authentically matches their style.

Be specific and detailed. Don't use generic descriptions. Pull real patterns from the provided data.
For sample_phrases, include 5-10 characteristic phrases or sentence structures.
For avoid_patterns, identify things this person would NEVER say.
For platform_overrides, suggest how the tone might slightly differ between X (shorter, punchier) and LinkedIn (more professional, longer form).`;

const INGEST_SYSTEM_PROMPT = `You are an expert at analyzing writing style, personality, and engagement patterns from social media content.

Your task is to build a comprehensive personality profile optimized for AUTO-REPLY training. This means you need to deeply understand:
1. How this person writes original posts (their voice, tone, style)
2. How they REPLY to others — this is critical. Analyze reply patterns, tone shifts, and engagement style.
3. What content they engage with (likes, replies) — to understand their interests and what triggers engagement.

Be extremely specific. Pull real patterns from the data. This profile will be used by an AI agent to automatically generate replies on their behalf, so accuracy is paramount.

For reply_style, describe exactly how they reply (length, structure, approach).
For reply_tone_shift, note how replies differ from original posts.
For engagement_topics, list specific topics they consistently engage with.
For reply_patterns, identify 3-5 recurring reply structures they use.
For sample_phrases, include 5-10 characteristic phrases from BOTH posts and replies.
For avoid_patterns, identify things this person would NEVER say.`;

function formatInputForAnalysis(input: AnalysisInput): string {
  switch (input.method) {
    case "scrape":
      return `Analyze these ${input.tweets.length} tweets to build a personality profile:\n\n${formatTweetsForAnalysis(input.tweets)}`;

    case "quiz":
      return `Build a personality profile from these questionnaire responses:\n\n${formatQuizForAnalysis(input.answers)}`;

    case "freetext": {
      let text = `The user describes their online personality as:\n\n"${input.description}"`;
      if (input.samplePosts?.length) {
        text += `\n\nThey also provided these sample posts:\n${input.samplePosts.map((p, i) => `[${i + 1}] ${p}`).join("\n\n")}`;
      }
      return text;
    }

    case "hybrid": {
      const sections: string[] = [];
      if (input.parts.tweets?.length) {
        sections.push(
          `## Scraped Tweets (${input.parts.tweets.length} posts)\n${formatTweetsForAnalysis(input.parts.tweets)}`
        );
      }
      if (input.parts.answers?.length) {
        sections.push(
          `## Quiz Responses\n${formatQuizForAnalysis(input.parts.answers)}`
        );
      }
      if (input.parts.description) {
        sections.push(
          `## Self-Description\n"${input.parts.description}"`
        );
      }
      return `Build a personality profile from the following combined data. Weight actual tweet data most heavily, then quiz responses, then self-description.\n\n${sections.join("\n\n")}`;
    }

    case "ingest": {
      const { ingestedData } = input;
      const sections: string[] = [];

      // Profile context
      sections.push(
        `## Profile\nName: ${ingestedData.profile.name}\nUsername: @${ingestedData.profile.username}\nBio: "${ingestedData.profile.bio}"\nFollowers: ${ingestedData.profile.followerCount} | Following: ${ingestedData.profile.followingCount}`
      );

      // Original tweets
      if (ingestedData.originalTweets.length > 0) {
        sections.push(
          `## Original Tweets (${ingestedData.originalTweets.length} posts)\n${formatTweetsForAnalysis(ingestedData.originalTweets)}`
        );
      }

      // Replies — critical for auto-reply training
      if (ingestedData.replies.length > 0) {
        sections.push(
          `## Replies (${ingestedData.replies.length} replies)\nPay special attention to HOW they reply — structure, tone, length, and approach.\n\n${formatRepliesForAnalysis(ingestedData.replies)}`
        );
      }

      // Liked content — shows engagement preferences
      if (ingestedData.likedTweets.length > 0) {
        sections.push(
          `## Liked Tweets (${ingestedData.likedTweets.length} likes)\nThese reveal what content resonates with them and what topics they care about.\n\n${formatLikedTweetsForAnalysis(ingestedData.likedTweets)}`
        );
      }

      // Top engaged accounts
      if (ingestedData.topEngagedAccounts.length > 0) {
        const accountList = ingestedData.topEngagedAccounts
          .map((a) => `@${a.username} (${a.replyCount} replies)`)
          .join(", ");
        sections.push(
          `## Top Engaged Accounts\nAccounts they reply to most: ${accountList}`
        );
      }

      return `Build a comprehensive personality profile from this full X profile ingestion. Focus especially on REPLY PATTERNS since this will be used for auto-reply training.\n\n${sections.join("\n\n")}`;
    }
  }
}

export async function analyzePersonality(
  input: AnalysisInput
): Promise<PersonalityProfile> {
  const userMessage = formatInputForAnalysis(input);
  const isIngest = input.method === "ingest";

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 3000,
    system: isIngest ? INGEST_SYSTEM_PROMPT : ANALYSIS_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
    tools: [
      {
        name: "save_personality_profile",
        description:
          "Save the analyzed personality profile. Call this with the complete profile data.",
        input_schema: PERSONALITY_PROFILE_SCHEMA,
      },
    ],
    tool_choice: { type: "tool", name: "save_personality_profile" },
  });

  const toolBlock = response.content.find((b) => b.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") {
    throw new Error("Failed to extract personality profile from analysis");
  }

  return toolBlock.input as PersonalityProfile;
}
