/**
 * Popcorn Video API client.
 *
 * Uses the MCP (Movie Creation Protocol) API to generate short videos
 * for tweet replies. Supports creating movies, polling for status,
 * and retrieving final video URLs.
 */

const POPCORN_API_URL = process.env.POPCORN_API_URL;
const MCP_API_KEY = process.env.MCP_API_KEY;

function getConfig() {
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

