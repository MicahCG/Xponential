import type { PersonalityProfile } from "@/lib/personality/types";
import { X_CHAR_LIMIT, LINKEDIN_CHAR_LIMIT } from "@/lib/constants";

export interface FeedbackExample {
  type: "do" | "dont";
  text: string;
  note?: string;
  url?: string;
}

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

function instructionsBlock(instructions: string | null | undefined): string {
  if (!instructions) return "";
  return `\nIMPORTANT — The user has provided these specific instructions for how they want their content to sound:\n"${instructions}"\nFollow these instructions closely. They override the personality profile where they conflict.\n`;
}

function examplesBlock(examples: FeedbackExample[] | null | undefined): string {
  if (!examples || examples.length === 0) return "";

  const good = examples.filter((e) => e.type === "do");
  const bad = examples.filter((e) => e.type === "dont");

  let block = "";

  if (good.length > 0) {
    block += `\nEXAMPLES OF GOOD CONTENT (match this style closely):\n`;
    for (const ex of good) {
      block += `- "${ex.text}"${ex.note ? ` (${ex.note})` : ""}\n`;
    }
  }

  if (bad.length > 0) {
    block += `\nEXAMPLES OF BAD CONTENT (avoid this style):\n`;
    for (const ex of bad) {
      block += `- "${ex.text}"${ex.note ? ` (${ex.note})` : ""}\n`;
    }
  }

  return block;
}

export function buildReplyPrompt(params: {
  personality: PersonalityProfile;
  targetPost: string;
  targetAuthor: string;
  recentPosts: string[];
  platform: "x" | "linkedin";
  count: number;
  replyInstructions?: string | null;
  feedbackExamples?: FeedbackExample[] | null;
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
${instructionsBlock(params.replyInstructions)}${examplesBlock(params.feedbackExamples)}
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
  replyInstructions?: string | null;
  feedbackExamples?: FeedbackExample[] | null;
}) {
  const charLimit =
    params.platform === "x" ? X_CHAR_LIMIT : LINKEDIN_CHAR_LIMIT;

  return `You are ghostwriting an original ${params.platform === "x" ? "tweet" : "LinkedIn post"} for someone with this voice:

${serializeProfile(params.personality)}
${instructionsBlock(params.replyInstructions)}${examplesBlock(params.feedbackExamples)}
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
  replyInstructions?: string | null;
  feedbackExamples?: FeedbackExample[] | null;
}) {
  const charLimit =
    params.platform === "x" ? X_CHAR_LIMIT : LINKEDIN_CHAR_LIMIT;

  return `You are ghostwriting a quote-${params.platform === "x" ? "tweet" : "post"} commentary for someone with this voice:

${serializeProfile(params.personality)}
${instructionsBlock(params.replyInstructions)}${examplesBlock(params.feedbackExamples)}
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
