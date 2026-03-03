export interface PersonalityProfile {
  tone: string;
  humor_style: string;
  formality: number;
  emoji_usage: "none" | "light" | "moderate" | "heavy";
  vocabulary_notes: string;
  avoid_patterns: string[];
  sample_phrases: string[];
  cultural_references: string;
  platform_overrides: {
    x?: Partial<Omit<PersonalityProfile, "platform_overrides">>;
    linkedin?: Partial<Omit<PersonalityProfile, "platform_overrides">>;
  };
}

export interface ScrapeInput {
  platform: "x";
  handle: string;
  tweetCount?: number;
}

export interface QuizAnswer {
  questionId: string;
  value: string | number;
}

export interface QuizInput {
  answers: QuizAnswer[];
}

export interface FreetextInput {
  description: string;
  samplePosts?: string[];
}

export interface HybridInput {
  scrape?: ScrapeInput;
  quiz?: QuizInput;
  freetext?: FreetextInput;
}

export type AnalysisInput =
  | { method: "scrape"; tweets: string[] }
  | { method: "quiz"; answers: QuizAnswer[] }
  | { method: "freetext"; description: string; samplePosts?: string[] }
  | { method: "hybrid"; parts: Partial<{ tweets: string[]; answers: QuizAnswer[]; description: string }> };

export const PERSONALITY_PROFILE_SCHEMA = {
  type: "object" as const,
  properties: {
    tone: {
      type: "string" as const,
      description: "Overall tone (e.g., 'confident, witty, casual')",
    },
    humor_style: {
      type: "string" as const,
      description: "Humor style (e.g., 'dry, meme-aware, pop-culture heavy')",
    },
    formality: {
      type: "number" as const,
      description: "Formality level from 1 (very casual) to 10 (very formal)",
    },
    emoji_usage: {
      type: "string" as const,
      enum: ["none", "light", "moderate", "heavy"],
      description: "How frequently emojis are used",
    },
    vocabulary_notes: {
      type: "string" as const,
      description: "Notes on vocabulary patterns and word choice",
    },
    avoid_patterns: {
      type: "array" as const,
      items: { type: "string" as const },
      description: "Patterns, phrases, or styles to avoid",
    },
    sample_phrases: {
      type: "array" as const,
      items: { type: "string" as const },
      description: "Characteristic phrases that capture the voice",
    },
    cultural_references: {
      type: "string" as const,
      description: "Domains of cultural references (e.g., 'tech, sports, pop culture')",
    },
    platform_overrides: {
      type: "object" as const,
      properties: {
        x: { type: "object" as const, description: "X-specific tone adjustments" },
        linkedin: { type: "object" as const, description: "LinkedIn-specific tone adjustments" },
      },
      description: "Platform-specific overrides",
    },
  },
  required: [
    "tone",
    "humor_style",
    "formality",
    "emoji_usage",
    "vocabulary_notes",
    "avoid_patterns",
    "sample_phrases",
    "cultural_references",
    "platform_overrides",
  ],
};
