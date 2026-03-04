import { openai } from "@/lib/openai";
import type { IngestedProfile } from "./scraper";

export interface AccountRecommendation {
  username: string;
  name?: string;
  followersCount?: number;
  replyCount: number;
  category?: string;
  isRecommended: boolean; // false = already engaged, true = AI-recommended
}

const RECOMMENDATION_SCHEMA = {
  type: "object" as const,
  properties: {
    recommendations: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          username: {
            type: "string" as const,
            description: "X handle without @",
          },
          category: {
            type: "string" as const,
            description:
              "Category tag (e.g., 'AI/ML', 'Tech', 'Startups', 'Finance')",
          },
          reason: {
            type: "string" as const,
            description: "Short reason why this account is recommended",
          },
        },
        required: ["username", "category", "reason"],
      },
    },
  },
  required: ["recommendations"],
};

/**
 * Takes ingested profile data and generates two lists:
 * 1. Accounts the user already engages with (from reply data)
 * 2. AI-recommended accounts based on interests and following list
 */
export async function getAccountRecommendations(
  ingestedData: IngestedProfile
): Promise<{
  engagedAccounts: AccountRecommendation[];
  recommendedAccounts: AccountRecommendation[];
}> {
  // 1. Build engaged accounts from reply data
  const engagedAccounts: AccountRecommendation[] =
    ingestedData.topEngagedAccounts.map((account) => {
      const followingMatch = ingestedData.following.find(
        (f) => f.username.toLowerCase() === account.username.toLowerCase()
      );
      return {
        username: account.username,
        name: followingMatch?.name,
        followersCount: followingMatch?.followersCount,
        replyCount: account.replyCount,
        isRecommended: false,
      };
    });

  // 2. Use AI to recommend accounts from following list
  const engagedUsernames = new Set(
    engagedAccounts.map((a) => a.username.toLowerCase())
  );
  const candidateAccounts = ingestedData.following
    .filter((f) => !engagedUsernames.has(f.username.toLowerCase()))
    .sort((a, b) => b.followersCount - a.followersCount)
    .slice(0, 50);

  if (candidateAccounts.length === 0) {
    return { engagedAccounts, recommendedAccounts: [] };
  }

  const prompt = `Based on this user's profile and interests, recommend the TOP 10 accounts they should set up auto-replies for.

## User Profile
Bio: "${ingestedData.profile.bio}"
Topics they engage with (from replies and likes): ${
    ingestedData.topEngagedAccounts
      .map((a) => `@${a.username}`)
      .join(", ") || "N/A"
  }

## Candidate Accounts (from who they follow)
${candidateAccounts
  .map(
    (a) =>
      `- @${a.username} (${a.name}) — ${a.followersCount.toLocaleString()} followers${a.bio ? ` — "${a.bio.slice(0, 100)}"` : ""}`
  )
  .join("\n")}

Pick up to 10 accounts that would be the most valuable for auto-reply engagement based on:
1. Relevance to the user's interests and expertise
2. Account popularity (higher followers = more visibility for replies)
3. Category diversity (spread across their interest areas)

Assign a category tag to each recommendation.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 1500,
      messages: [
        {
          role: "system",
          content:
            "You recommend X accounts for a user to set up auto-replies to. Pick accounts that align with their interests and would give them visibility.",
        },
        { role: "user", content: prompt },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "submit_recommendations",
            description: "Submit account recommendations",
            parameters: RECOMMENDATION_SCHEMA,
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "submit_recommendations" } },
    });

    const toolCall = response.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.type !== "function") {
      return { engagedAccounts, recommendedAccounts: [] };
    }

    const result = JSON.parse(toolCall.function.arguments) as {
      recommendations: {
        username: string;
        category: string;
        reason: string;
      }[];
    };

    const recommendedAccounts: AccountRecommendation[] =
      result.recommendations.map((rec) => {
        const match = candidateAccounts.find(
          (c) => c.username.toLowerCase() === rec.username.toLowerCase()
        );
        return {
          username: rec.username,
          name: match?.name,
          followersCount: match?.followersCount,
          replyCount: 0,
          category: rec.category,
          isRecommended: true,
        };
      });

    return { engagedAccounts, recommendedAccounts };
  } catch (err) {
    console.error("Failed to generate recommendations:", err);
    const fallback: AccountRecommendation[] = candidateAccounts
      .slice(0, 10)
      .map((a) => ({
        username: a.username,
        name: a.name,
        followersCount: a.followersCount,
        replyCount: 0,
        isRecommended: true,
      }));
    return { engagedAccounts, recommendedAccounts: fallback };
  }
}
