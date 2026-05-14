import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";
import type { PersonalityProfile } from "@/lib/personality/types";
import type { TrendingTopic } from "@/lib/platform/x-trending";

export interface OriginalDraft {
  content: string;
  pickedTopic: string | null;
  rationale: string;
}

export interface GenerateOriginalInput {
  personality: PersonalityProfile;
  replyInstructions?: string | null;
  trending: TrendingTopic[];
  topicFocus?: string[];
  recentOwnPosts?: string[];
}

const ORIGINAL_SYSTEM_PROMPT = `You write a single original tweet (under 280 chars) in a specific account's voice.

Pick from the provided trending topics ONLY if at least one fits the account's voice and topic interests. If nothing fits, you may write about an evergreen topic from their engagement_topics. Do NOT force a fit.

A good original tweet:
- has a real point: an observation, take, mini-story, contrarian angle, or sharp question
- sounds like the account, not generic copy
- is self-contained — no thread implied, no link required to make sense
- avoids these tells: emoji signatures the user doesn't actually use, "Here's a thread:", "Just a thought —", "Hot take:", ending with "Thoughts?"

Constraints:
- 280 chars max (count strictly)
- Match emoji_usage exactly (none means none, light means at most 1)
- Honor avoid_patterns
- Don't repeat recent_own_posts in topic or framing`;

const SCHEMA = {
  type: "object" as const,
  properties: {
    content: {
      type: "string" as const,
      description: "The tweet text, under 280 characters",
    },
    pickedTopic: {
      type: ["string", "null"] as unknown as "string",
      description: "Trending topic label that inspired the post, or null if none fit",
    },
    rationale: {
      type: "string" as const,
      description: "One short sentence on why this works for the voice",
    },
  },
  required: ["content", "pickedTopic", "rationale"],
};

function summarizePersonality(p: PersonalityProfile): string {
  return [
    `tone: ${p.tone}`,
    `humor: ${p.humor_style}`,
    `formality: ${p.formality}/10`,
    `emoji_usage: ${p.emoji_usage}`,
    `engagement_topics: ${(p.engagement_topics ?? []).join(", ") || p.cultural_references}`,
    `vocabulary: ${p.vocabulary_notes}`,
    `avoid: ${p.avoid_patterns.join("; ")}`,
    p.sample_phrases.length
      ? `sample voice phrases: ${p.sample_phrases.slice(0, 5).join(" / ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function formatTrending(topics: TrendingTopic[], limit = 15): string {
  if (topics.length === 0) return "(no trending topics available)";
  return topics
    .slice(0, limit)
    .map((t) => {
      const vol = t.tweetVolume ? ` (${t.tweetVolume.toLocaleString()} posts)` : "";
      return `- ${t.label}${vol}`;
    })
    .join("\n");
}

export async function generateOriginalDraft(
  input: GenerateOriginalInput
): Promise<OriginalDraft> {
  const focusBlock =
    input.topicFocus && input.topicFocus.length > 0
      ? `\nThis brand's topic focus (only pick trending topics matching one of these themes; otherwise write on an evergreen engagement_topic):\n${input.topicFocus
          .map((t) => `- ${t}`)
          .join("\n")}\n`
      : "";

  const recentBlock =
    input.recentOwnPosts && input.recentOwnPosts.length > 0
      ? `\nRecent posts from this account (don't repeat topic or framing):\n${input.recentOwnPosts
          .slice(0, 6)
          .map((p, i) => `${i + 1}. ${p}`)
          .join("\n")}\n`
      : "";

  const instructionsBlock = input.replyInstructions
    ? `\nAdditional voice instructions for this account:\n${input.replyInstructions}\n`
    : "";

  const userMessage = `Account voice profile:
${summarizePersonality(input.personality)}
${instructionsBlock}${focusBlock}
Current X trending topics:
${formatTrending(input.trending)}
${recentBlock}
Write one original tweet for this account now.`;

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 800,
    system: ORIGINAL_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
    tools: [
      {
        name: "submit_tweet",
        description: "Submit the original tweet draft",
        input_schema: SCHEMA,
      },
    ],
    tool_choice: { type: "tool", name: "submit_tweet" },
  });

  const toolBlock = response.content.find((b) => b.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") {
    throw new Error("Original generator returned no tool_use result");
  }

  const parsed = toolBlock.input as {
    content: string;
    pickedTopic: string | null;
    rationale: string;
  };
  const trimmed = parsed.content.trim();
  if (trimmed.length === 0) {
    throw new Error("Original generator returned empty content");
  }
  if (trimmed.length > 280) {
    throw new Error(`Original draft over 280 chars (${trimmed.length})`);
  }

  return {
    content: trimmed,
    pickedTopic: parsed.pickedTopic ?? null,
    rationale: parsed.rationale,
  };
}
