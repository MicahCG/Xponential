import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";

/**
 * Popcorn's create_movie tool caps `brief` at 5000 characters. Many users
 * write long agent-style templates (multi-section system prompts with
 * reference examples, defaults, format menus). This helper takes such a
 * template as the system prompt and asks Claude to produce ONE concrete
 * sub-5000-char brief that Popcorn can consume directly.
 *
 * Short templates pass through unchanged — we only call Claude when needed.
 */

// Slightly under Popcorn's 5000 hard cap so we have a safety margin.
const POPCORN_BRIEF_MAX = 4800;
// If a template is already short enough, send it as-is — saves a Claude call.
const PASS_THROUGH_THRESHOLD = 4800;

const DISTILL_INSTRUCTION = `Read the template above as your operating instructions for producing a single video brief.

Output ONE complete, self-contained video brief now. The brief will be sent directly to Popcorn (an AI video generator) to produce a 30–90 second short video.

Requirements:
- Output ONLY the brief itself. No preamble, no "Here is a brief:", no headers.
- The brief must be self-contained: describe the visual scene, palette, pacing, music vibe, on-screen text, and any creative direction Popcorn needs.
- If your operating instructions list menus of options (hook angles, palettes, etc.) and don't specify a choice, pick one that fits the template's defaults or "surprise me" guidance.
- Stay under 4,500 characters. Tighter is better — Popcorn does best with focused, concrete briefs.
- Use natural language. Bullet points and short sentences are fine; ASCII art and code blocks are not.`;

export interface BriefResult {
  /** The final brief string sent to Popcorn (always ≤ 4800 chars). */
  brief: string;
  /** True if Claude distilled the template; false if the template was passed through. */
  distilled: boolean;
}

export async function generateBriefFromTemplate(
  template: string
): Promise<BriefResult> {
  const trimmed = template.trim();
  if (!trimmed) {
    throw new Error("Template is empty.");
  }

  // Short enough to send directly — skip the Claude call.
  if (trimmed.length <= PASS_THROUGH_THRESHOLD) {
    return { brief: trimmed, distilled: false };
  }

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2000,
    system: trimmed,
    messages: [{ role: "user", content: DISTILL_INSTRUCTION }],
  });

  const text = response.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("Brief distillation returned empty content.");
  }

  // Defensive truncation — Claude usually respects the limit, but Popcorn's
  // hard cap is uncompromising.
  const brief =
    text.length <= POPCORN_BRIEF_MAX ? text : text.slice(0, POPCORN_BRIEF_MAX);
  return { brief, distilled: true };
}
