/**
 * Popcorn API client — talks to Popcorn's MCP HTTP endpoint via JSON-RPC.
 *
 * MCP HTTP transport (spec rev 2025-03-26) requires a two-step handshake:
 *   1. POST `initialize` → server responds with an Mcp-Session-Id header.
 *   2. Every subsequent request includes Mcp-Session-Id: <uuid> as a header.
 *
 * We cache the session ID at module scope so it survives across invocations
 * of the same serverless instance. On a 4xx that signals the session is
 * missing/expired, we invalidate the cache and retry once.
 *
 * Two methods we need today:
 *   - createMovie(brief, opts) → returns { movieId }
 *   - getMovie(movieId)        → returns { status, videoUrl? }
 */

const DEFAULT_MCP_URL = "https://api.popcorn.co/mcp";
const PROTOCOL_VERSION = "2025-03-26";

let cachedSessionId: string | null = null;

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

/**
 * Send a JSON-RPC payload to the MCP endpoint. Handles both response shapes
 * (single JSON or text/event-stream with one data line) and returns the
 * parsed envelope along with the raw Response so callers can grab headers
 * (specifically Mcp-Session-Id from the initialize call).
 */
async function rawRpc<T>(
  payload: JsonRpcRequest,
  sessionId: string | null
): Promise<{ data: JsonRpcResponse<T>; response: Response }> {
  const { url, apiKey } = getConfig();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
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

  const contentType = res.headers.get("content-type") || "";
  let data: JsonRpcResponse<T>;
  if (contentType.includes("text/event-stream")) {
    const text = await res.text();
    data = pickJsonRpcResponseFromSse(text, payload.id);
  } else {
    data = (await res.json()) as JsonRpcResponse<T>;
  }

  return { data, response: res };
}

/**
 * Parse an SSE stream and return the JSON-RPC response that matches the
 * request id. MCP servers can send multiple events in a single response:
 * progress notifications, log messages, and finally the result. The earlier
 * version of this code grabbed the FIRST data line, which is why long-running
 * Popcorn movies that *did* complete got marked "failed" or "still generating"
 * — we were reading intermediate notifications instead of the actual
 * response. Pick the message whose JSON-RPC `id` matches what we sent; fall
 * back to the last well-formed JSON-RPC message if no id matches.
 */
function pickJsonRpcResponseFromSse<T>(
  text: string,
  requestId: number
): JsonRpcResponse<T> {
  // SSE events are delimited by blank lines. Within an event, data fields
  // concatenate (joined with newline per spec). We don't care about event
  // names — only the data payloads.
  const events = text.split(/\r?\n\r?\n/);
  const messages: JsonRpcResponse<T>[] = [];
  for (const event of events) {
    const dataLines = event
      .split(/\r?\n/)
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trimStart());
    if (dataLines.length === 0) continue;
    const joined = dataLines.join("\n");
    try {
      const parsed = JSON.parse(joined) as Partial<JsonRpcResponse<T>>;
      if (parsed && (parsed as { jsonrpc?: string }).jsonrpc === "2.0") {
        messages.push(parsed as JsonRpcResponse<T>);
      }
    } catch {
      // Not JSON, skip — it's likely a status/log notification we don't model.
    }
  }

  if (messages.length === 0) {
    throw new PopcornError({
      message: "Popcorn MCP returned an SSE stream with no JSON-RPC messages.",
      code: "empty_sse",
      raw: text,
    });
  }

  // Prefer the one with our request id (that's the actual response per spec).
  const match = messages.find(
    (m) => (m as { id?: number }).id === requestId
  );
  if (match) return match;

  // No id match — could be a server that doesn't echo ids, or our request id
  // was rewritten. Fall back to the last message with a `result` or `error`
  // field (notifications have neither).
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as { result?: unknown; error?: unknown };
    if (m.result !== undefined || m.error !== undefined) {
      return messages[i];
    }
  }

  // If we only ever saw notifications, throw cleanly instead of returning
  // something callTool can't make sense of (which would manifest as a
  // generic TypeError that the cron silently swallows).
  throw new PopcornError({
    message:
      "Popcorn MCP returned an SSE stream with only notifications and no JSON-RPC response.",
    code: "no_rpc_response",
    raw: text,
  });
}

/**
 * Initialize an MCP session. Returns the Mcp-Session-Id the server issues,
 * which must be passed on every subsequent request.
 */
async function initializeSession(): Promise<string> {
  const init: JsonRpcRequest = {
    jsonrpc: "2.0",
    id: Date.now(),
    method: "initialize",
    params: {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "xponential", version: "0.1" },
    },
  };
  const { data, response } = await rawRpc<unknown>(init, null);
  if ("error" in data) {
    throw new PopcornError({
      message: `Popcorn MCP initialize failed: ${data.error.message}`,
      code: String(data.error.code),
      raw: data.error.data,
    });
  }
  const sessionId =
    response.headers.get("mcp-session-id") ??
    response.headers.get("Mcp-Session-Id");
  if (!sessionId) {
    throw new PopcornError({
      message:
        "Popcorn MCP initialize did not return an Mcp-Session-Id header.",
      code: "no_session_id",
    });
  }
  return sessionId;
}

async function ensureSession(): Promise<string> {
  if (cachedSessionId) return cachedSessionId;
  cachedSessionId = await initializeSession();
  return cachedSessionId;
}

function isSessionError(err: unknown): boolean {
  if (!(err instanceof PopcornError)) return false;
  // Server returns -32000 with "Mcp-Session-Id header is required" when the
  // session is missing or expired. We also retry on any 4xx that mentions
  // session, to be safe.
  const msg = err.message.toLowerCase();
  return (
    msg.includes("mcp-session-id") ||
    msg.includes("session") && (err.httpCode === 400 || err.httpCode === 401)
  );
}

async function rpc<T>(
  method: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  const sendOnce = async (): Promise<T> => {
    const sessionId = await ensureSession();
    const body: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params,
    };
    const { data } = await rawRpc<T>(body, sessionId);
    if ("error" in data) {
      throw new PopcornError({
        message: `Popcorn MCP error: ${data.error.message}`,
        code: String(data.error.code),
        raw: data.error.data,
        httpCode: 200,
      });
    }
    return data.result;
  };

  try {
    return await sendOnce();
  } catch (err) {
    // Session expired or invalidated — reset cache and retry once.
    if (isSessionError(err)) {
      cachedSessionId = null;
      return sendOnce();
    }
    throw err;
  }
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

/** Recursively walk an object/array and pick the first plausible video URL. */
function findVideoUrl(node: unknown, depth = 0): string | null {
  if (depth > 6 || node == null) return null;
  if (typeof node === "string") {
    const match = node.match(
      /https?:\/\/[^\s"'<>]+\.(?:mp4|mov|webm|m3u8)(?:\?[^\s"'<>]*)?/i
    );
    return match ? match[0] : null;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = findVideoUrl(item, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;
    const prioritized = [
      "video_url",
      "videoUrl",
      "mp4_url",
      "download_url",
      "downloadUrl",
      "final_video_url",
      "final_url",
      "media_url",
      "mediaUrl",
      "url",
    ];
    for (const k of prioritized) {
      const v = obj[k];
      if (typeof v === "string") {
        const hit = findVideoUrl(v, depth + 1);
        if (hit) return hit;
      }
    }
    for (const v of Object.values(obj)) {
      const hit = findVideoUrl(v, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

function findString(node: unknown, keys: string[], depth = 0): string | null {
  if (depth > 6 || node == null) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = findString(item, keys, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;
    for (const k of keys) {
      if (typeof obj[k] === "string") return obj[k] as string;
    }
    for (const v of Object.values(obj)) {
      const hit = findString(v, keys, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

export async function getMovie(movieId: string): Promise<PopcornMovieState> {
  const result = await callTool<unknown>("get_movie", { id: movieId });

  // Diagnostic — Vercel logs show Popcorn's exact response so we can adjust
  // parsing if their schema changes. Trimmed to keep logs manageable.
  try {
    const preview = JSON.stringify(result).slice(0, 800);
    console.log(`[popcorn] get_movie(${movieId}) →`, preview);
  } catch {
    console.log(`[popcorn] get_movie(${movieId}) → [unserializable]`);
  }

  const status =
    findString(result, [
      "status",
      "state",
      "movieStatus",
      "movie_status",
    ]) ?? "unknown";

  const videoUrl = findVideoUrl(result);

  const top = result as Record<string, unknown> | null;
  const progress =
    top && typeof top.progress === "number" ? (top.progress as number) : null;

  // Popcorn uses different keys in different places: "error" for transient
  // worker failures (e.g. "interrupted"), "error_message" / "errorMessage" for
  // structured failures. Capture all so callers see *why* Popcorn flagged it.
  const errorMessage =
    findString(result, ["error_message", "errorMessage", "error"]) ?? null;

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
