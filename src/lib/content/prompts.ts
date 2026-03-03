import type { PersonalityProfile } from "@/lib/personality/types";
import { X_CHAR_LIMIT, LINKEDIN_CHAR_LIMIT } from "@/lib/constants";

function serializeProfile(profile: PersonalityProfile): string {
  return `Voice Profile:
- Tone: ${profile.tone}
- Humor: ${profile.humor_style}
- Formality: ${profile.formality}/10
- Emoji usage: ${profile.emoji_usage}
- Vocabulary: ${profile.vocabulary_notes}
- Cultural references: ${profile.cultural_references}
- Sample phrases: ${profile.sample_phrases.map((p) => `"${p}"`).join(", ")}
- NEVER do: ${profile.avoid_patterns.join(", ")}`;
}

export function buildReplyPrompt(params: {
  personality: PersonalityProfile;
  targetPost: string;
  targetAuthor: string;
  recentPosts: string[];
  platform: "x" | "linkedin";
  count: number;
}) {
  const charLimit =
    params.platform === "x" ? X_CHAR_LIMIT : LINKEDIN_CHAR_LIMIT;
  const platformProfile =
    params.platform === "x"
      ? params.personality.platform_overrides?.x
      : params.personality.platform_overrides?.linkedin;

  return `You are ghostwriting a ${params.platform === "x" ? "tweet" : "LinkedIn"} reply for someone with this voice:

${serializeProfile(params.personality)}
${platformProfile ? `\nPlatform-specific adjustments: ${JSON.stringify(platformProfile)}` : ""}

They are replying to this post by @${params.targetAuthor}:
"${params.targetPost}"

${
  params.recentPosts.length > 0
    ? `Their recent posts (do NOT repeat similar content or themes):\n${params.recentPosts.map((p) => `- "${p}"`).join("\n")}\n`
    : ""
}
Generate exactly ${params.count} reply options. Each must:
- Be under ${charLimit} characters
- Match the personality profile exactly
- Be contextually relevant to the original post
- Sound authentic, not generic or AI-generated
- Have a distinct angle/approach from the other options`;
}

export function buildOriginalPostPrompt(params: {
  personality: PersonalityProfile;
  topic: string;
  recentPosts: string[];
  platform: "x" | "linkedin";
  count: number;
  additionalContext?: string;
}) {
  const charLimit =
    params.platform === "x" ? X_CHAR_LIMIT : LINKEDIN_CHAR_LIMIT;

  return `You are ghostwriting an original ${params.platform === "x" ? "tweet" : "LinkedIn post"} for someone with this voice:

${serializeProfile(params.personality)}

Topic: ${params.topic}
${params.additionalContext ? `Additional context: ${params.additionalContext}` : ""}

${
  params.recentPosts.length > 0
    ? `Their recent posts (do NOT repeat similar content):\n${params.recentPosts.map((p) => `- "${p}"`).join("\n")}\n`
    : ""
}
Generate exactly ${params.count} post options. Each must:
- Be under ${charLimit} characters
- Match the personality profile exactly
- Provide genuine value or insight on the topic
- Sound authentic, not generic or AI-generated
- Have a distinct angle from the other options`;
}

export function buildQuotePrompt(params: {
  personality: PersonalityProfile;
  targetPost: string;
  targetAuthor: string;
  recentPosts: string[];
  platform: "x" | "linkedin";
  count: number;
}) {
  const charLimit =
    params.platform === "x" ? X_CHAR_LIMIT : LINKEDIN_CHAR_LIMIT;

  return `You are ghostwriting a quote-${params.platform === "x" ? "tweet" : "post"} commentary for someone with this voice:

${serializeProfile(params.personality)}

They are quote-sharing this post by @${params.targetAuthor}:
"${params.targetPost}"

${
  params.recentPosts.length > 0
    ? `Their recent posts (do NOT repeat similar content):\n${params.recentPosts.map((p) => `- "${p}"`).join("\n")}\n`
    : ""
}
Generate exactly ${params.count} commentary options. Each must:
- Be under ${charLimit} characters
- Add meaningful commentary (not just "great post!")
- Match the personality profile exactly
- Sound authentic, not generic`;
}
