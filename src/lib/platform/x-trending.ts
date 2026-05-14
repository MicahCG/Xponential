const APIFY_API_BASE = "https://api.apify.com/v2";

export interface TrendingTopic {
  label: string;
  tweetVolume?: number;
  url?: string;
}

interface FetchOptions {
  /** Apify region/country for trends. Defaults to "United States". */
  country?: string;
  /** Maximum number of topics to return. */
  limit?: number;
  /** Timeout for the Apify run, seconds. */
  timeoutSec?: number;
}

function getApifyToken(): string | null {
  return process.env.APIFY_API_TOKEN ?? null;
}

function getActorId(): string | null {
  // Configurable so we can swap actors without redeploying schema-affecting code.
  // Example values: "apidojo~twitter-trends-scraper", "epctex~twitter-trends-scraper"
  return process.env.APIFY_X_TRENDING_ACTOR ?? null;
}

/**
 * Fetches current X/Twitter trending topics via an Apify actor.
 * Fails soft — if the actor isn't configured or the run errors, returns an empty
 * array so the caller can decide whether to proceed without trends.
 */
export async function fetchXTrending(opts: FetchOptions = {}): Promise<TrendingTopic[]> {
  const token = getApifyToken();
  const actorId = getActorId();

  if (!token) {
    console.warn("[x-trending] APIFY_API_TOKEN missing — skipping trends fetch");
    return [];
  }
  if (!actorId) {
    console.warn("[x-trending] APIFY_X_TRENDING_ACTOR not configured — skipping trends fetch");
    return [];
  }

  const { country = "United States", limit = 25, timeoutSec = 60 } = opts;

  try {
    const runUrl = `${APIFY_API_BASE}/acts/${actorId}/runs?token=${token}&waitForFinish=${timeoutSec}`;
    const runResponse = await fetch(runUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ country, location: country, limit, maxItems: limit }),
    });

    if (!runResponse.ok) {
      console.error(`[x-trending] Apify run failed: HTTP ${runResponse.status}`);
      return [];
    }

    const run = await runResponse.json();
    if (run.data?.status !== "SUCCEEDED") {
      console.warn(`[x-trending] Apify run status: ${run.data?.status ?? "unknown"}`);
      return [];
    }

    const datasetId = run.data?.defaultDatasetId;
    if (!datasetId) return [];

    const datasetResponse = await fetch(
      `${APIFY_API_BASE}/datasets/${datasetId}/items?token=${token}&limit=${limit}`
    );
    if (!datasetResponse.ok) return [];

    const items = (await datasetResponse.json()) as Record<string, unknown>[];
    return items
      .map(normalizeTrendingItem)
      .filter((t): t is TrendingTopic => t !== null)
      .slice(0, limit);
  } catch (err) {
    console.error("[x-trending] Unexpected error fetching trends:", err);
    return [];
  }
}

/**
 * Different Apify trending actors return slightly different shapes.
 * Normalize the common ones into TrendingTopic.
 */
function normalizeTrendingItem(item: Record<string, unknown>): TrendingTopic | null {
  const label =
    (item.name as string | undefined) ??
    (item.trend as string | undefined) ??
    (item.topic as string | undefined) ??
    (item.title as string | undefined) ??
    (item.label as string | undefined);
  if (!label) return null;

  const volumeRaw =
    item.tweet_volume ?? item.tweetVolume ?? item.volume ?? item.tweet_count ?? item.posts;
  const tweetVolume =
    typeof volumeRaw === "number"
      ? volumeRaw
      : typeof volumeRaw === "string" && /^\d+$/.test(volumeRaw)
        ? Number(volumeRaw)
        : undefined;

  const url =
    (item.url as string | undefined) ??
    (item.search_url as string | undefined) ??
    (item.searchUrl as string | undefined);

  return { label, tweetVolume, url };
}
