const APIFY_API_BASE = "https://api.apify.com/v2";
const ACTOR_ID = "supreme_coder~linkedin-post";

export interface LinkedInPost {
  id: string;          // activity ID, e.g. "7289521182721093633"
  postUrl: string;
  text: string;
  authorName: string;
  authorUrl: string;
  postedDate: string;  // ISO string
  likesCount?: number;
  commentsCount?: number;
}

function getToken(): string {
  const token = process.env.APIFY_LINKEDIN_TOKEN;
  if (!token) throw new Error("APIFY_LINKEDIN_TOKEN is not configured");
  return token;
}

/**
 * Scrapes recent posts from a LinkedIn profile URL.
 * profileUrl: e.g. "https://www.linkedin.com/in/satyanadella"
 * Returns posts sorted newest first, limited to the last `limit` posts
 * that are newer than `sinceDate` (if provided).
 */
export async function scrapeLinkedInPosts(
  profileUrl: string,
  limit = 5,
  sinceDate?: Date
): Promise<LinkedInPost[]> {
  const token = getToken();

  const input: Record<string, unknown> = {
    startUrls: [profileUrl],
    limitPerSource: limit,
  };

  if (sinceDate) {
    // Format as YYYY-MM-DD
    input.scrapeUntilDate = sinceDate.toISOString().split("T")[0];
  }

  // Start run and wait up to 120s
  const runUrl = `${APIFY_API_BASE}/acts/${ACTOR_ID}/runs?token=${token}&waitForFinish=120`;
  const runRes = await fetch(runUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!runRes.ok) {
    const err = await runRes.text();
    throw new Error(`LinkedIn scraper Apify error (${runRes.status}): ${err}`);
  }

  const run = await runRes.json();

  if (run.data?.status !== "SUCCEEDED") {
    throw new Error(`LinkedIn scraper run ${run.data?.status ?? "unknown"}`);
  }

  const datasetId = run.data?.defaultDatasetId;
  if (!datasetId) throw new Error("LinkedIn scraper: no dataset ID");

  const dataRes = await fetch(
    `${APIFY_API_BASE}/datasets/${datasetId}/items?token=${token}`
  );
  if (!dataRes.ok) throw new Error("LinkedIn scraper: failed to fetch dataset");

  const items = (await dataRes.json()) as Record<string, unknown>[];

  return items
    .map((item): LinkedInPost | null => {
      // Extract activity ID from postUrl
      const postUrl = item.postUrl as string | undefined;
      const text = (item.text ?? item.description ?? item.content) as string | undefined;
      const postedDate = (item.postedDate ?? item.date ?? item.publishedAt) as string | undefined;
      const authorName = (item.authorName ?? item.author) as string | undefined;
      const authorUrl = (item.authorUrl ?? item.profileUrl) as string | undefined;

      if (!postUrl || !text) return null;

      // Extract activity ID from URL: .../activity-7289521182721093633
      const idMatch = postUrl.match(/activity-(\d+)/);
      const id = (item.id as string | undefined) ?? idMatch?.[1] ?? postUrl;

      return {
        id,
        postUrl,
        text,
        authorName: authorName ?? "Unknown",
        authorUrl: authorUrl ?? profileUrl,
        postedDate: postedDate ?? new Date().toISOString(),
        likesCount: item.likesCount as number | undefined,
        commentsCount: item.commentsCount as number | undefined,
      };
    })
    .filter((p): p is LinkedInPost => p !== null);
}
