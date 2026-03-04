import { z } from "zod";

// Personality validators
export const scrapeSchema = z.object({
  tweetCount: z.number().int().min(10).max(100).default(100),
});

export const quizSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.string(),
      value: z.union([z.string(), z.number()]),
    })
  ),
});

export const freetextSchema = z.object({
  description: z.string().min(20).max(5000),
  samplePosts: z.array(z.string().max(500)).max(10).optional(),
});

export const hybridSchema = z.object({
  scrape: z
    .object({
      platform: z.literal("x"),
      handle: z.string().optional(),
      tweetCount: z.number().int().min(10).max(100).default(100),
    })
    .optional(),
  quiz: quizSchema.optional(),
  freetext: freetextSchema.optional(),
});

export const updateProfileSchema = z.object({
  tone: z.string().optional(),
  humor_style: z.string().optional(),
  formality: z.number().min(1).max(10).optional(),
  emoji_usage: z.enum(["none", "light", "moderate", "heavy"]).optional(),
  vocabulary_notes: z.string().optional(),
  avoid_patterns: z.array(z.string()).optional(),
  sample_phrases: z.array(z.string()).optional(),
  cultural_references: z.string().optional(),
  platform_overrides: z.object({
    x: z.record(z.string(), z.unknown()).optional(),
    linkedin: z.record(z.string(), z.unknown()).optional(),
  }).optional(),
  replyInstructions: z.string().max(1000).optional(),
});

// Content validators
export const generateContentSchema = z.object({
  platform: z.enum(["x", "linkedin"]),
  postType: z.enum(["reply", "quote", "original"]),
  targetPostUrl: z.string().url().optional(),
  targetPostContent: z.string().max(10000).optional(),
  targetAuthor: z.string().optional(),
  topic: z.string().max(500).optional(),
  additionalContext: z.string().max(2000).optional(),
  count: z.number().int().min(1).max(5).default(3),
});

export const updateQueueItemSchema = z.object({
  status: z.enum(["approved", "rejected"]).optional(),
  content: z.string().max(10000).optional(),
});

export const publishContentSchema = z.object({
  queueItemId: z.string(),
});
