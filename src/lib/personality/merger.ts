import type { AnalysisInput, HybridInput, QuizAnswer } from "./types";
import { scrapeUserTweets } from "./scraper";

export async function buildHybridInput(
  userId: string,
  input: HybridInput
): Promise<AnalysisInput> {
  const parts: {
    tweets?: string[];
    answers?: QuizAnswer[];
    description?: string;
  } = {};

  if (input.scrape) {
    parts.tweets = await scrapeUserTweets(
      userId,
      input.scrape.tweetCount ?? 100
    );
  }

  if (input.quiz) {
    parts.answers = input.quiz.answers;
  }

  if (input.freetext) {
    parts.description = input.freetext.description;
  }

  return { method: "hybrid", parts };
}
