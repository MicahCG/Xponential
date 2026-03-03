import type { Platform, PostType, Barrel, QueueStatus } from "@prisma/client";

export type { Platform, PostType, Barrel, QueueStatus };

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

export interface PlatformConnectionInfo {
  id: string;
  platform: Platform;
  accountHandle: string | null;
  connectedAt: Date;
  status: string;
}
