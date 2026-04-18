import { anthropic } from "@/lib/anthropic";
import { prisma } from "@/lib/prisma";
import type { PersonalityProfile } from "@/lib/personality/types";

const GATE_MODEL = "claude-haiku-4-5-20251001";

export interface GateInput {
  tweetText: string;
  targetAuthor: string;
  personality: PersonalityProfile;
  learnedSkipCriteria?: string[] | null;
}

export interface GateScore {
  score: number;
  reasons: string[];
}

export interface GateDecision extends GateScore {
  shouldReply: boolean;
  samplingRoll: number;
  threshold: number;
}

function summarizePersonality(p: PersonalityProfile): string {
  return [
    `tone: ${p.tone}`,
    `humor: ${p.humor_style}`,
    `topics they engage with: ${p.cultural_references}`,
    `things to avoid: ${p.avoid_patterns.join("; ")}`,
  ].join("\n");
}

const GATE_SYSTEM_PROMPT = `You score whether a tweet is worth replying to for a specific account's voice.

A tweet is WORTH replying to if it:
- has a real claim, opinion, story, or question (not just a link, a hashtag pile, or a generic hype line)
- has an angle a reply can add to — a counterpoint, an analogy, a reframe, a fresh fact, dry humor that lands
- fits the account's known topics and voice

A tweet is NOT worth replying to if it:
- is a bare link or image with no substantive text
- is a one-word reaction, RT chain, or pure hype ("huge", "lfg", "this")
- is off-topic for the account's voice (niche inside joke, unrelated niche, pure spam)
- is so generic that any reply would be filler
- would require a reply that just restates the tweet

Score 0–100:
- 85–100: clearly substantive + strong angle available + on-voice
- 70–84: substantive, decent angle
- 55–69: marginal — some substance but weak angle or partial voice fit
- 0–54: skip (low substance, off-voice, or no angle)

Return the score and short reasons (1–3 bullets). Be strict; when in doubt, score lower.`;

const GATE_SCHEMA = {
  type: "object" as const,
  properties: {
    score: {
      type: "integer" as const,
      description: "0–100 score for reply-worthiness",
    },
    reasons: {
      type: "array" as const,
      items: { type: "string" as const },
      description: "1–3 short reasons explaining the score",
    },
  },
  required: ["score", "reasons"],
};

export async function scoreTweet(input: GateInput): Promise<GateScore> {
  const criteriaBlock =
    input.learnedSkipCriteria && input.learnedSkipCriteria.length > 0
      ? `\nAccount-specific learned skip criteria (from past performance — apply these strictly):\n${input.learnedSkipCriteria
          .map((c) => `- ${c}`)
          .join("\n")}\n`
      : "";

  const prompt = `Account voice:
${summarizePersonality(input.personality)}
${criteriaBlock}
Tweet by @${input.targetAuthor}:
"${input.tweetText}"

Score this tweet's reply-worthiness for this account.`;

  const response = await anthropic.messages.create({
    model: GATE_MODEL,
    max_tokens: 400,
    system: GATE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
    tools: [
      {
        name: "submit_score",
        description: "Submit the reply-worthiness score and reasons",
        input_schema: GATE_SCHEMA,
      },
    ],
    tool_choice: { type: "tool", name: "submit_score" },
  });

  const toolBlock = response.content.find((b) => b.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") {
    return { score: 60, reasons: ["gate scorer returned no result — default-passed"] };
  }

  const parsed = toolBlock.input as { score: number; reasons: string[] };
  const clamped = Math.max(0, Math.min(100, Math.round(parsed.score)));
  return { score: clamped, reasons: parsed.reasons.slice(0, 3) };
}

export async function loadPersonalityForGate(
  userId: string,
  connectionId?: string
): Promise<PersonalityProfile | null> {
  const profile = await prisma.personalityProfile.findFirst({
    where: {
      userId,
      isActive: true,
      ...(connectionId && { platformConnectionId: connectionId }),
    },
    select: { profileData: true },
  });
  if (!profile) return null;
  return profile.profileData as unknown as PersonalityProfile;
}

export function decideFromScore(
  score: GateScore,
  threshold: number,
  rng: () => number = Math.random
): GateDecision {
  const roll = rng();
  if (score.score < threshold) {
    return { ...score, threshold, samplingRoll: roll, shouldReply: false };
  }

  let passRate: number;
  if (score.score >= 85) passRate = 0.95;
  else if (score.score >= 70) passRate = 0.75;
  else passRate = 0.55;

  return {
    ...score,
    threshold,
    samplingRoll: roll,
    shouldReply: roll < passRate,
  };
}
