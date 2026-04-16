/**
 * Popcorn Video API client.
 *
 * Uses the MCP (Movie Creation Protocol) API to generate short videos
 * for tweet replies. Supports creating movies, polling for status,
 * and retrieving final video URLs.
 *
 * ⛔ ALL POPCORN API INTEGRATIONS ARE HALTED.
 * Every exported function will throw immediately — no requests will be sent.
 * To re-enable, remove the POPCORN_HALTED flag and the guard function below.
 */

const POPCORN_HALTED = true;

function assertNotHalted(): void {
  if (POPCORN_HALTED) {
    throw new Error("Popcorn API integrations are halted. No requests will be sent.");
  }
}

const POPCORN_API_URL = process.env.POPCORN_API_URL;
const MCP_API_KEY = process.env.MCP_API_KEY;

function getConfig() {
  assertNotHalted();
  if (!POPCORN_API_URL) {
    throw new Error("POPCORN_API_URL is not configured. Add it to your environment variables.");
  }
  if (!MCP_API_KEY) {
    throw new Error("MCP_API_KEY is not configured. Add it to your environment variables.");
  }
  return { apiUrl: POPCORN_API_URL, apiKey: MCP_API_KEY };
}

// ─── Types ──────────────────────────────────────────────────

export type VideoDuration = "15" | "30" | "45" | "60";
export type VideoOrientation = "horizontal" | "vertical";
export type VideoQuality =
  | "budget"
  | "low"
  | "medium"
  | "high"
  | "premium"
  | "professional";

export interface CreateMovieParams {
  prompt: string;
  duration?: VideoDuration;
  orientation?: VideoOrientation;
  style?: string;
  quality?: VideoQuality;
  userId: string;
}

export interface CreateMovieResult {
  conversationId: string;
  movieRootId: string;
}

export interface MovieStatus {
  found: boolean;
  movieRootId?: string;
  movieId?: string;
  status: "processing" | "ready";
  title?: string;
  videoUrl?: string;
  watermarkedVideoUrl?: string;
  thumbnailUrl?: string;
}

export interface MovieUrl {
  movieRootId?: string;
  movieId?: string;
  isReady: boolean;
  videoUrl?: string;
  watermarkedVideoUrl?: string;
  thumbnailUrl?: string;
  title?: string;
}

// ─── Helpers ────────────────────────────────────────────────

/**
 * Given a Popcorn HLS manifest URL (.m3u8), fetches the manifest and
 * returns the direct URL to the highest-quality .ts video file.
 * The .ts file is a single publicly-accessible H.264 video that Apify
 * can download and pass to Twitter's media upload API.
 */
export async function getDirectTsUrl(manifestUrl: string): Promise<string | null> {
  assertNotHalted();
  try {
    const baseDir = manifestUrl.substring(0, manifestUrl.lastIndexOf("/"));

    // Fetch master manifest — lists quality variants
    const masterRes = await fetch(manifestUrl);
    if (!masterRes.ok) return null;
    const master = await masterRes.text();

    // Find first sub-manifest line (e.g. "576p-ts.m3u8")
    const lines = master.split("\n").map((l) => l.trim()).filter(Boolean);
    const subManifestName = lines.find((l) => l.endsWith(".m3u8") && !l.startsWith("#"));
    if (!subManifestName) return null;

    // Fetch sub-manifest — lists the actual .ts file(s)
    const subRes = await fetch(`${baseDir}/${subManifestName}`);
    if (!subRes.ok) return null;
    const sub = await subRes.text();

    // Find the .ts filename (e.g. "576p-ts0000000000.ts")
    const subLines = sub.split("\n").map((l) => l.trim()).filter(Boolean);
    const tsName = subLines.find((l) => l.endsWith(".ts") && !l.startsWith("#"));
    if (!tsName) return null;

    return `${baseDir}/${tsName}`;
  } catch {
    return null;
  }
}

// ─── API Functions ──────────────────────────────────────────

/**
 * Create a new video generation job.
 * Returns immediately with a movieRootId for polling.
 */
export async function createMovie(
  params: CreateMovieParams
): Promise<CreateMovieResult> {
  const { apiUrl, apiKey } = getConfig();

  const body = {
    prompt: params.prompt,
    duration: params.duration ?? "15",
    orientation: params.orientation ?? "vertical",
    style: params.style ?? "cinematic",
    quality: params.quality ?? "medium",
    userId: params.userId,
  };

  console.log("[Popcorn] Creating movie:", {
    prompt: body.prompt.slice(0, 100),
    duration: body.duration,
    orientation: body.orientation,
  });

  const res = await fetch(`${apiUrl}/api/mcp/createMovie`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[Popcorn] createMovie failed:", res.status, errText);
    throw new Error(
      `Popcorn createMovie failed (HTTP ${res.status}): ${errText}`
    );
  }

  const data = (await res.json()) as CreateMovieResult;
  console.log("[Popcorn] Movie creation started:", data.movieRootId);
  return data;
}

/**
 * Check the status of a movie generation job.
 * Returns status: "processing" or "ready".
 */
export async function getMovieStatus(
  movieRootId: string
): Promise<MovieStatus> {
  const { apiUrl, apiKey } = getConfig();

  const url = new URL(`${apiUrl}/api/mcp/getMovieStatus`);
  url.searchParams.set("movieRootId", movieRootId);

  const res = await fetch(url.toString(), {
    headers: { "x-api-key": apiKey },
  });

  if (!res.ok && res.status !== 202) {
    const errText = await res.text();
    throw new Error(
      `Popcorn getMovieStatus failed (HTTP ${res.status}): ${errText}`
    );
  }

  return (await res.json()) as MovieStatus;
}

/**
 * Triggers watermarked MP4 generation for a completed movie.
 * Must be called after the movie status is "ready".
 * The watermarkedVideoUrl in subsequent getMovieUrl calls will be populated once done.
 */
export async function triggerWatermarkedVideo(
  movieRootId: string
): Promise<{ watermarkedVideoUrl?: string }> {
  const { apiUrl, apiKey } = getConfig();

  const res = await fetch(`${apiUrl}/api/mcp/triggerWatermarkedVideo`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({ movieRootId }),
  });

  if (!res.ok && res.status !== 202) {
    const errText = await res.text();
    throw new Error(
      `Popcorn triggerWatermarkedVideo failed (HTTP ${res.status}): ${errText}`
    );
  }

  const data = await res.json();
  console.log("[Popcorn] triggerWatermarkedVideo response:", JSON.stringify(data));
  return data as { watermarkedVideoUrl?: string };
}

/**
 * Get the final video URL for a completed movie.
 */
export async function getMovieUrl(movieRootId: string): Promise<MovieUrl> {
  const { apiUrl, apiKey } = getConfig();

  const url = new URL(`${apiUrl}/api/mcp/getMovieUrl`);
  url.searchParams.set("movieRootId", movieRootId);

  const res = await fetch(url.toString(), {
    headers: { "x-api-key": apiKey },
  });

  if (!res.ok && res.status !== 202) {
    const errText = await res.text();
    throw new Error(
      `Popcorn getMovieUrl failed (HTTP ${res.status}): ${errText}`
    );
  }

  const raw = await res.json();
  // Log full response so we can discover all available URL fields (mp4, hls, etc.)
  console.log("[Popcorn] getMovieUrl response:", JSON.stringify(raw));
  return raw as MovieUrl;
}

