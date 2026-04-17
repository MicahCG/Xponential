import type { PersonalityProfile } from "@/lib/personality/types";
import { X_CHAR_LIMIT } from "@/lib/constants";

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

function learningsBlock(learnings: string | null | undefined): string {
  if (!learnings) return "";
  return `\n${learnings}\n`;
}

function examplesBlock(examples: FeedbackExample[] | null | undefined): string {
  if (!examples || examples.length === 0) return "";

  const good = examples.filter((e) => e.type === "do");
  const bad = examples.filter((e) => e.type === "dont");

  let block = "";

  if (good.length > 0) {
    block += `\nEXAMPLES OF GOOD CONTENT (match the energy and quality, but NOT the exact format or sentence structure — use varied structures):\n`;
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
  platform: "x";
  count: number;
  replyInstructions?: string | null;
  feedbackExamples?: FeedbackExample[] | null;
  learnings?: string | null;
}) {
  const charLimit = X_CHAR_LIMIT;
  const platformProfile = params.personality.platform_overrides?.x;

  return `You are ghostwriting a tweet reply for someone with this voice:

${serializeProfile(params.personality)}
${platformProfile ? `\nPlatform-specific adjustments: ${JSON.stringify(platformProfile)}` : ""}
${instructionsBlock(params.replyInstructions)}${examplesBlock(params.feedbackExamples)}${learningsBlock(params.learnings)}
They are replying to this post by @${params.targetAuthor}:
"${params.targetPost}"

${
  params.recentPosts.length > 0
    ? `Their recent posts (do NOT repeat similar content, themes, OR sentence structures/templates):\n${params.recentPosts.map((p) => `- "${p}"`).join("\n")}\n`
    : ""
}
Generate exactly ${params.count} reply options. Each must:
- Be under ${charLimit} characters
- Match the personality profile exactly
- Be contextually relevant to the original post
- Sound authentic, not generic or AI-generated
- Have a distinct angle/approach from the other options
- NEVER use em dashes (—) or en dashes (–). Use commas, periods, colons, or restructure instead
- Be witty, informative, or insightful as the context demands. Prioritize whatever angle will drive the most likes and engagement
- Add genuine value: a sharp observation, a surprising fact, a clever reframe, or a thought-provoking question. Never just agree or restate what was said

CRITICAL — FORMAT VARIETY: Each reply MUST use a different sentence structure from the recent posts above. Do NOT reuse a template like "[name] just discovered that [X]" or any other repeating pattern. Mix it up: questions, observations, metaphors, short punchy takes, dry humor, callbacks, hypotheticals, analogies, etc. If the recent posts show a repeating format, actively break away from it.`;
}

export function buildOriginalPostPrompt(params: {
  personality: PersonalityProfile;
  topic: string;
  recentPosts: string[];
  platform: "x";
  count: number;
  additionalContext?: string;
  replyInstructions?: string | null;
  feedbackExamples?: FeedbackExample[] | null;
  learnings?: string | null;
}) {
  const charLimit = X_CHAR_LIMIT;

  return `You are ghostwriting an original tweet for someone with this voice:

${serializeProfile(params.personality)}
${instructionsBlock(params.replyInstructions)}${examplesBlock(params.feedbackExamples)}${learningsBlock(params.learnings)}
Topic: ${params.topic}
${params.additionalContext ? `Additional context: ${params.additionalContext}` : ""}

${
  params.recentPosts.length > 0
    ? `Their recent posts (do NOT repeat similar content, themes, OR sentence structures/templates):\n${params.recentPosts.map((p) => `- "${p}"`).join("\n")}\n`
    : ""
}
Generate exactly ${params.count} post options. Each must:
- Be under ${charLimit} characters
- Match the personality profile exactly
- Provide genuine value or insight on the topic
- Sound authentic, not generic or AI-generated
- Have a distinct angle from the other options
- NEVER use em dashes (—) or en dashes (–). Use commas, periods, colons, or restructure instead
- Be witty, informative, or insightful. Optimize for engagement and shareability
- Use a different sentence structure from the recent posts above. Avoid repeating any template or format pattern`;
}

export function buildQuotePrompt(params: {
  personality: PersonalityProfile;
  targetPost: string;
  targetAuthor: string;
  recentPosts: string[];
  platform: "x";
  count: number;
  replyInstructions?: string | null;
  feedbackExamples?: FeedbackExample[] | null;
  learnings?: string | null;
}) {
  const charLimit = X_CHAR_LIMIT;

  return `You are ghostwriting a quote-tweet commentary for someone with this voice:

${serializeProfile(params.personality)}
${instructionsBlock(params.replyInstructions)}${examplesBlock(params.feedbackExamples)}${learningsBlock(params.learnings)}
They are quote-sharing this post by @${params.targetAuthor}:
"${params.targetPost}"

${
  params.recentPosts.length > 0
    ? `Their recent posts (do NOT repeat similar content, themes, OR sentence structures/templates):\n${params.recentPosts.map((p) => `- "${p}"`).join("\n")}\n`
    : ""
}
Generate exactly ${params.count} commentary options. Each must:
- Be under ${charLimit} characters
- Add meaningful commentary (not just "great post!")
- Match the personality profile exactly
- Sound authentic, not generic
- NEVER use em dashes (—) or en dashes (–). Use commas, periods, colons, or restructure instead
- Be witty, informative, or insightful. Add a perspective that makes people want to like and share
- Use a different sentence structure from the recent posts above. Avoid repeating any template or format pattern`;
}
