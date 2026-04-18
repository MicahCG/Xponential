import { anthropic } from "@/lib/anthropic";
import { prisma } from "@/lib/prisma";
import type { Platform } from "@prisma/client";

const ANALYZER_MODEL = "claude-haiku-4-5-20251001";

const ANALYZER_SYSTEM_PROMPT = `You synthesize learned "skip criteria" for an auto-reply quality gate.

You receive two lists of tweets from the past 30 days for one watched account:
- REPLIED_HIGH: tweets the account replied to that drove real engagement
- REPLIED_LOW: tweets the account replied to that got little or no engagement
- SKIPPED: tweets the gate already skipped (for pattern context)

Your job: produce 3–6 concrete, falsifiable "skip if..." criteria that describe the shape of tweets NOT worth replying to for this account, based on REPLIED_LOW patterns. Avoid generic rules ("skip if boring"). Be specific ("skip if the tweet is only a link with no opinion text", "skip if the tweet is a bare hashtag pile").

Preserve things the account clearly does well — don't propose a rule that would have blocked any REPLIED_HIGH tweet.`;

const ANALYZER_SCHEMA = {
  type: "object" as const,
  properties: {
    skipCriteria: {
      type: "array" as const,
      items: { type: "string" as const },
      description: "3–6 concrete 'skip if...' criteria",
    },
  },
  required: ["skipCriteria"],
};

interface BandStats {
  band: string;
  count: number;
  medianEngagement: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function bandForScore(score: number | null, threshold: number): string {
  if (score === null) return "unscored";
  if (score < threshold) return "below_threshold";
  if (score < 70) return "marginal";
  if (score < 85) return "good";
  return "strong";
}

function engagementOf(e: Record<string, number> | null): number {
  if (!e) return 0;
  return (
    (e.likes ?? 0) * 3 +
    (e.retweets ?? 0) * 5 +
    (e.replies ?? 0) * 4 +
    (e.bookmarks ?? 0) * 2
  );
}

function nextThreshold(current: number, bands: Map<string, BandStats>): number {
  const marginal = bands.get("marginal");
  const good = bands.get("good");
  const strong = bands.get("strong");

  // Raise threshold if "good" band underperforms "strong" dramatically
  if (
    good &&
    strong &&
    good.count >= 3 &&
    strong.count >= 3 &&
    good.medianEngagement < strong.medianEngagement * 0.3
  ) {
    return Math.min(80, current + 5);
  }
  // Lower threshold if "strong" is starved but "marginal" performs reasonably
  if (
    (!strong || strong.count < 2) &&
    marginal &&
    marginal.count >= 5 &&
    marginal.medianEngagement > 0
  ) {
    return Math.max(40, current - 5);
  }
  return current;
}

export interface GateAnalysisResult {
  accountsProcessed: number;
  accountsUpdated: number;
  skipped: number;
  errors: string[];
}

export async function analyzeGates(
  platform: Platform = "x"
): Promise<GateAnalysisResult> {
  const result: GateAnalysisResult = {
    accountsProcessed: 0,
    accountsUpdated: 0,
    skipped: 0,
    errors: [],
  };

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const accounts = await prisma.watchedAccount.findMany({
    where: { isEnabled: true, platform },
  });

  for (const account of accounts) {
    result.accountsProcessed++;
    try {
      const logs = await prisma.autoReplyLog.findMany({
        where: {
          watchedAccountId: account.id,
          createdAt: { gte: cutoff },
        },
        select: {
          id: true,
          targetTweetId: true,
          targetTweetText: true,
          status: true,
          qualityScore: true,
          skipReasons: true,
        },
      });

      if (logs.length < 10) {
        result.skipped++;
        continue; // not enough signal
      }

      // Pull engagement for posted replies via postHistory join on targetPostId
      const postedTweetIds = logs
        .filter((l) => l.status === "posted")
        .map((l) => l.targetTweetId);
      const posts =
        postedTweetIds.length > 0
          ? await prisma.postHistory.findMany({
              where: { targetPostId: { in: postedTweetIds }, userId: account.userId },
              select: { targetPostId: true, engagement: true },
            })
          : [];
      const engagementByTweetId = new Map<string, number>();
      for (const p of posts) {
        if (p.targetPostId) {
          engagementByTweetId.set(
            p.targetPostId,
            engagementOf(p.engagement as Record<string, number> | null)
          );
        }
      }

      // Bucket replied logs by score band
      const bandValues = new Map<string, number[]>();
      for (const l of logs) {
        if (l.status !== "posted") continue;
        const band = bandForScore(l.qualityScore, account.replyThreshold);
        const eng = engagementByTweetId.get(l.targetTweetId) ?? 0;
        if (!bandValues.has(band)) bandValues.set(band, []);
        bandValues.get(band)!.push(eng);
      }
      const bands = new Map<string, BandStats>();
      for (const [band, vals] of bandValues) {
        bands.set(band, {
          band,
          count: vals.length,
          medianEngagement: median(vals),
        });
      }

      const newThreshold = nextThreshold(account.replyThreshold, bands);

      // Build Claude input: pick up to 8 highest-engagement replies, 8 lowest, 8 skipped
      const postedWithEng = logs
        .filter((l) => l.status === "posted")
        .map((l) => ({
          text: l.targetTweetText,
          engagement: engagementByTweetId.get(l.targetTweetId) ?? 0,
        }))
        .sort((a, b) => b.engagement - a.engagement);
      const highReplied = postedWithEng.slice(0, 8);
      const lowReplied = postedWithEng.slice(-8).filter((p) => p.engagement === 0 || p.engagement < (highReplied[0]?.engagement ?? 0) * 0.2);
      const skipped = logs
        .filter((l) => l.status === "skipped_low_quality")
        .slice(0, 8)
        .map((l) => ({
          text: l.targetTweetText,
          reasons: (l.skipReasons as string[] | null) ?? [],
        }));

      let skipCriteria: string[] | null = null;
      if (highReplied.length >= 2 && (lowReplied.length >= 2 || skipped.length >= 2)) {
        const prompt = `Account: @${account.accountHandle}

REPLIED_HIGH (tweets we replied to that drove engagement):
${highReplied.map((t, i) => `${i + 1}. [${t.engagement}] "${t.text}"`).join("\n")}

REPLIED_LOW (tweets we replied to that got little or no engagement):
${lowReplied.length > 0 ? lowReplied.map((t, i) => `${i + 1}. [${t.engagement}] "${t.text}"`).join("\n") : "(none)"}

SKIPPED (tweets the gate already rejected):
${skipped.length > 0 ? skipped.map((t, i) => `${i + 1}. reasons=${JSON.stringify(t.reasons)} — "${t.text}"`).join("\n") : "(none)"}

Produce the evolved skip criteria.`;

        const response = await anthropic.messages.create({
          model: ANALYZER_MODEL,
          max_tokens: 600,
          system: ANALYZER_SYSTEM_PROMPT,
          messages: [{ role: "user", content: prompt }],
          tools: [
            {
              name: "submit_criteria",
              description: "Submit evolved skip criteria",
              input_schema: ANALYZER_SCHEMA,
            },
          ],
          tool_choice: { type: "tool", name: "submit_criteria" },
        });

        const toolBlock = response.content.find((b) => b.type === "tool_use");
        if (toolBlock && toolBlock.type === "tool_use") {
          const parsed = toolBlock.input as { skipCriteria: string[] };
          skipCriteria = parsed.skipCriteria.slice(0, 6);
        }
      }

      const changed =
        newThreshold !== account.replyThreshold ||
        (skipCriteria && JSON.stringify(skipCriteria) !== JSON.stringify(account.skipCriteria));

      if (changed) {
        await prisma.watchedAccount.update({
          where: { id: account.id },
          data: {
            replyThreshold: newThreshold,
            ...(skipCriteria && { skipCriteria: skipCriteria as object }),
          },
        });
        result.accountsUpdated++;
      }
    } catch (err) {
      result.errors.push(
        `Account ${account.accountHandle}: ${err instanceof Error ? err.message : "analysis failed"}`
      );
    }
  }

  return result;
}
