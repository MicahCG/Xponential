/**
 * Popcorn API client — talks to Popcorn's MCP HTTP endpoint via JSON-RPC.
 *
 * Popcorn exposes its production API as an MCP server at api.popcorn.co/mcp.
 * MCP-over-HTTP is just JSON-RPC: POST a tools/call request, get a result back.
 * We use the bearer-token transport (POPCORN_API_KEY).
 *
 * Two methods we need today:
 *   - createMovie(brief, opts) → returns { movieId }
 *   - getMovie(movieId)        → returns { status, videoUrl? }
 */

const DEFAULT_MCP_URL = "https://api.popcorn.co/mcp";

export class PopcornError extends Error {
  readonly code: string;
  readonly httpCode?: number;
  readonly raw?: unknown;
  constructor(opts: {
    message: string;
    code?: string;
    httpCode?: number;
    raw?: unknown;
  }) {
    super(opts.message);
    this.name = "PopcornError";
    this.code = opts.code ?? "popcorn_error";
    this.httpCode = opts.httpCode;
    this.raw = opts.raw;
  }
}

function getConfig(): { url: string; apiKey: string } {
  const apiKey = process.env.POPCORN_API_KEY;
  if (!apiKey) {
    throw new PopcornError({
      message:
        "POPCORN_API_KEY is not configured. Add the Popcorn API key to env.",
      code: "missing_api_key",
    });
  }
  const url = process.env.POPCORN_MCP_URL || DEFAULT_MCP_URL;
  return { url, apiKey };
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcSuccess<T> {
  jsonrpc: "2.0";
  id: number;
  result: T;
}

interface JsonRpcError {
  jsonrpc: "2.0";
  id: number;
  error: { code: number; message: string; data?: unknown };
}

type JsonRpcResponse<T> = JsonRpcSuccess<T> | JsonRpcError;

async function rpc<T>(
  method: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  const { url, apiKey } = getConfig();
  const body: JsonRpcRequest = {
    jsonrpc: "2.0",
    id: Date.now(),
    method,
    params,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new PopcornError({
      message: `Popcorn MCP HTTP ${res.status}: ${text.slice(0, 300)}`,
      code: `http_${res.status}`,
      httpCode: res.status,
      raw: text,
    });
  }

  const data = (await res.json()) as JsonRpcResponse<T>;
  if ("error" in data) {
    throw new PopcornError({
      message: `Popcorn MCP error: ${data.error.message}`,
      code: String(data.error.code),
      raw: data.error.data,
    });
  }
  return data.result;
}

/**
 * MCP tools/call wrapper. Popcorn's tools (create_movie, get_movie, etc.)
 * are exposed via the standard MCP "tools/call" method.
 */
async function callTool<T>(
  name: string,
  args: Record<string, unknown>
): Promise<T> {
  type ToolCallResult = {
    content: Array<{ type: string; text?: string }>;
    isError?: boolean;
    structuredContent?: T;
  };

  const result = await rpc<ToolCallResult>("tools/call", {
    name,
    arguments: args,
  });

  if (result.isError) {
    const text =
      result.content
        ?.map((c) => c.text)
        .filter(Boolean)
        .join(" ") ?? "Unknown tool error";
    throw new PopcornError({
      message: `Popcorn tool '${name}' returned an error: ${text}`,
      code: "tool_error",
      raw: result,
    });
  }

  // Prefer structuredContent when Popcorn returns it. Otherwise parse the
  // first text block as JSON (MCP convention).
  if (result.structuredContent !== undefined) {
    return result.structuredContent;
  }
  const text = result.content?.find((c) => c.type === "text")?.text;
  if (!text) {
    throw new PopcornError({
      message: `Popcorn tool '${name}' returned no usable content.`,
      code: "no_content",
      raw: result,
    });
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    // Some tools return a plain string. Return it wrapped if T allows it.
    return text as unknown as T;
  }
}

// ─── Public API ────────────────────────────────────────────────────

export interface CreateMovieOptions {
  brief: string;
  duration?: number;
  orientation?: "portrait" | "landscape" | "square";
  style?: string;
}

export interface PopcornMovieRef {
  id: string;
}

export async function createMovie(
  opts: CreateMovieOptions
): Promise<PopcornMovieRef> {
  const args: Record<string, unknown> = { brief: opts.brief };
  if (opts.duration !== undefined) args.duration = opts.duration;
  if (opts.orientation) args.orientation = opts.orientation;
  if (opts.style) args.style = opts.style;

  const result = await callTool<{ id?: string; movie_id?: string; movieId?: string }>(
    "create_movie",
    args
  );
  const id = result.id ?? result.movie_id ?? result.movieId;
  if (!id) {
    throw new PopcornError({
      message: "Popcorn create_movie did not return an id.",
      code: "no_movie_id",
      raw: result,
    });
  }
  return { id };
}

export interface PopcornMovieState {
  id: string;
  status: string;
  videoUrl: string | null;
  progress?: number | null;
  errorMessage?: string | null;
  /** Raw shape for debugging — we don't depend on it. */
  raw?: unknown;
}

export async function getMovie(movieId: string): Promise<PopcornMovieState> {
  const result = await callTool<Record<string, unknown>>("get_movie", {
    id: movieId,
  });

  const status =
    (result.status as string | undefined) ??
    (result.state as string | undefined) ??
    "unknown";
  const videoUrl =
    (result.video_url as string | undefined) ??
    (result.videoUrl as string | undefined) ??
    (result.url as string | undefined) ??
    null;
  const progress =
    typeof result.progress === "number" ? (result.progress as number) : null;
  const errorMessage =
    (result.error_message as string | undefined) ??
    (result.errorMessage as string | undefined) ??
    null;

  return {
    id: movieId,
    status,
    videoUrl,
    progress,
    errorMessage,
    raw: result,
  };
}

/**
 * Convenience: status normalization. Popcorn may use various status strings;
 * map them to a small set so callers can switch on terminal vs in-progress.
 */
export type MovieStatus = "generating" | "ready" | "failed" | "unknown";
export function normalizeStatus(status: string): MovieStatus {
  const s = status.toLowerCase();
  if (s.includes("error") || s === "failed" || s === "cancelled") return "failed";
  if (
    s === "complete" ||
    s === "completed" ||
    s === "ready" ||
    s === "done" ||
    s === "succeeded"
  )
    return "ready";
  if (
    s === "pending" ||
    s === "queued" ||
    s === "generating" ||
    s === "processing" ||
    s === "in_progress" ||
    s === "running"
  )
    return "generating";
  return "unknown";
}
