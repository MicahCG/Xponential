import { prisma } from "@/lib/prisma";
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
