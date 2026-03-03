import { TwitterApi } from "twitter-api-v2";

export function createXClient(accessToken: string) {
  return new TwitterApi(accessToken);
}

export async function getUserProfile(accessToken: string) {
  const client = createXClient(accessToken);
  const me = await client.v2.me({
    "user.fields": ["username", "name", "profile_image_url"],
  });
  return {
    id: me.data.id,
    username: me.data.username,
    name: me.data.name,
  };
}

export async function getUserTimeline(
  accessToken: string,
  userId: string,
  maxResults = 100
) {
  const client = createXClient(accessToken);
  const timeline = await client.v2.userTimeline(userId, {
    max_results: Math.min(maxResults, 100),
    exclude: ["retweets"],
    "tweet.fields": ["created_at", "text", "public_metrics"],
  });

  return timeline.data.data ?? [];
}

export async function postTweet(
  accessToken: string,
  text: string,
  replyToId?: string
) {
  const client = createXClient(accessToken);
  const params: { text: string; reply?: { in_reply_to_tweet_id: string } } = {
    text,
  };

  if (replyToId) {
    params.reply = { in_reply_to_tweet_id: replyToId };
  }

  const result = await client.v2.tweet(params);
  return result.data;
}
