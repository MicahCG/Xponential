import { anthropic } from "@/lib/anthropic";
import type { PersonalityProfile } from "@/lib/personality/types";

const GATE_MODEL = "claude-haiku-4-5-20251001";

export interface OriginalGateInput {
  draft: string;
  personality: PersonalityProfile;
  topicFocus?: string[];
  recentOwnPosts?: string[];
}

export interface OriginalGateScore {
  score: number;
  reasons: string[];
}

export interface OriginalGateDecision extends OriginalGateScore {
  shouldPost: boolean;
  samplingRoll: number;
  threshold: number;
}

const GATE_SYSTEM_PROMPT = `You score whether an ORIGINAL tweet draft is good enough to publish for a specific account.

A draft is WORTH posting if it:
- has a real point: an observation, take, mini-story, sharp question, or contrarian angle
- sounds like the account's voice (tone, humor, vocab, emoji_usage)
- fits the account's known topics or engagement areas
- is self-contained (no implied thread, no missing link to make sense)
- doesn't recycle a recent post's topic or framing

A draft is NOT worth posting if it:
- is generic hype, motivational fluff, or vague "here's a thought" filler
- uses emojis or phrasing the account doesn't actually use
- repeats a recent post's angle
- is off-voice (wrong formality, wrong topics)
- ends with "Thoughts?" or similar engagement-bait when the account doesn't do that

Score 0–100:
- 85–100: strong voice fit + real substance + fresh angle
- 70–84: solid, postable, minor nits
- 55–69: marginal — weak substance, slight off-voice
- 0–54: skip (off-voice, generic, recycled, or empty)

Return the score and 1–3 short reasons. Be strict; when in doubt, score lower.`;

const SCHEMA = {
  type: "object" as const,
  properties: {
    score: { type: "integer" as const, description: "0–100 post-worthiness score" },
    reasons: {
      type: "array" as const,
      items: { type: "string" as const },
      description: "1–3 short reasons",
    },
  },
  required: ["score", "reasons"],
};

function summarizePersonality(p: PersonalityProfile): string {
  return [
    `tone: ${p.tone}`,
    `humor: ${p.humor_style}`,
    `emoji_usage: ${p.emoji_usage}`,
    `engagement_topics: ${(p.engagement_topics ?? []).join(", ") || p.cultural_references}`,
    `avoid: ${p.avoid_patterns.join("; ")}`,
  ].join("\n");
}

export async function scoreOriginalDraft(
  input: OriginalGateInput
): Promise<OriginalGateScore> {
  const focusBlock =
    input.topicFocus && input.topicFocus.length > 0
      ? `\nBrand topic focus: ${input.topicFocus.join(", ")}\n`
      : "";
  const recentBlock =
    input.recentOwnPosts && input.recentOwnPosts.length > 0
      ? `\nRecent posts (must not be a topic/framing repeat):\n${input.recentOwnPosts
          .slice(0, 6)
          .map((p, i) => `${i + 1}. ${p}`)
          .join("\n")}\n`
      : "";

  const userPrompt = `Account voice:
${summarizePersonality(input.personality)}
${focusBlock}${recentBlock}
Draft tweet:
"${input.draft}"

Score this draft's post-worthiness for this account.`;

  const response = await anthropic.messages.create({
    model: GATE_MODEL,
    max_tokens: 400,
    system: GATE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
    tools: [
      {
        name: "submit_score",
        description: "Submit the post-worthiness score and reasons",
        input_schema: SCHEMA,
      },
    ],
    tool_choice: { type: "tool", name: "submit_score" },
  });

  const toolBlock = response.content.find((b) => b.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") {
    return { score: 60, reasons: ["gate returned no result — default-passed"] };
  }
  const parsed = toolBlock.input as { score: number; reasons: string[] };
  const clamped = Math.max(0, Math.min(100, Math.round(parsed.score)));
  return { score: clamped, reasons: parsed.reasons.slice(0, 3) };
}

const DEFAULT_THRESHOLD = 70;

export function decideOriginalFromScore(
  score: OriginalGateScore,
  threshold: number = DEFAULT_THRESHOLD,
  rng: () => number = Math.random
): OriginalGateDecision {
  const roll = rng();
  if (score.score < threshold) {
    return { ...score, threshold, samplingRoll: roll, shouldPost: false };
  }
  // Originals are higher-stakes than replies — bias toward posting once the gate passes.
  let passRate: number;
  if (score.score >= 85) passRate = 1.0;
  else if (score.score >= 75) passRate = 0.9;
  else passRate = 0.7;
  return { ...score, threshold, samplingRoll: roll, shouldPost: roll < passRate };
}
