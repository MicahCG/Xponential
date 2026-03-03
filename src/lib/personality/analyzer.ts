import { anthropic } from "@/lib/claude";
import type { AnalysisInput, PersonalityProfile } from "./types";
import { PERSONALITY_PROFILE_SCHEMA } from "./types";
import { formatTweetsForAnalysis } from "./scraper";
import { formatQuizForAnalysis } from "./quiz";

const ANALYSIS_SYSTEM_PROMPT = `You are an expert at analyzing writing style and personality from social media content.

Your task is to build a comprehensive personality profile that captures the author's voice, tone, humor, and communication patterns. This profile will be used to generate content that authentically matches their style.

Be specific and detailed. Don't use generic descriptions. Pull real patterns from the provided data.
For sample_phrases, include 5-10 characteristic phrases or sentence structures.
For avoid_patterns, identify things this person would NEVER say.
For platform_overrides, suggest how the tone might slightly differ between X (shorter, punchier) and LinkedIn (more professional, longer form).`;

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
  }
}

export async function analyzePersonality(
  input: AnalysisInput
): Promise<PersonalityProfile> {
  const userMessage = formatInputForAnalysis(input);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250514",
    max_tokens: 2000,
    system: ANALYSIS_SYSTEM_PROMPT,
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

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Failed to extract personality profile from analysis");
  }

  return toolUse.input as unknown as PersonalityProfile;
}
