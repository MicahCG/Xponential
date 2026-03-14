import { prisma } from "@/lib/prisma";
import type { Platform } from "@prisma/client";
import type { LearningInsight } from "./analyzer";

/**
 * Fetches the last 14 days of content learnings for a user on a platform
 * and returns them formatted as a prompt block.
 * Returns null if no learnings exist yet.
 */
export async function getRecentLearnings(
  userId: string,
  platform: Platform
): Promise<string | null> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const records = await prisma.contentLearning.findMany({
    where: {
      userId,
      platform,
      date: { gte: cutoff },
    },
    orderBy: { date: "desc" },
    take: 14,
    select: { insights: true, date: true, postsAnalyzed: true },
  });

  if (records.length === 0) return null;

  // Flatten all insights, deduplicate by actionable text, keep most recent per category
  const seenActionables = new Set<string>();
  const allInsights: (LearningInsight & { date: Date })[] = [];

  for (const record of records) {
    const insights = record.insights as unknown as LearningInsight[];
    for (const insight of insights) {
      if (!seenActionables.has(insight.actionable)) {
        seenActionables.add(insight.actionable);
        allInsights.push({ ...insight, date: record.date });
      }
    }
  }

  // Sort: high confidence first, then medium
  const ranked = allInsights.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.confidence] - order[b.confidence];
  });

  // Cap at top 12 insights to keep prompt lean
  const top = ranked.slice(0, 12);

  if (top.length === 0) return null;

  const lines = top.map((i) => `- ${i.actionable} (${i.confidence} confidence — ${i.finding})`);

  return `PERFORMANCE LEARNINGS (based on your recent post data):
${lines.join("\n")}

Apply these learnings when generating content. They reflect what has actually worked for this specific audience.`;
}
