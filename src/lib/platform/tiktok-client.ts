import { prisma } from "@/lib/prisma";
import { refreshAccessToken } from "@/lib/oauth/tiktok";
import { getCurrentConnection } from "@/lib/connection-context";

const API_BASE = "https://open.tiktokapis.com/v2";

export class TikTokApiError extends Error {
  readonly httpCode: number;
  readonly responseBody?: unknown;
  readonly isAuthError: boolean;

  constructor(opts: {
    message: string;
    httpCode: number;
    responseBody?: unknown;
    isAuthError?: boolean;
  }) {
    super(opts.message);
    this.name = "TikTokApiError";
    this.httpCode = opts.httpCode;
    this.responseBody = opts.responseBody;
    this.isAuthError = opts.isAuthError ?? (opts.httpCode === 401 || opts.httpCode === 403);
  }
}

interface ApiLogEntry {
  workspaceId: string;
  userId: string;
  method: string;
  endpoint: string;
  requestBody?: unknown;
  responseStatus?: number;
  responseBody?: unknown;
  success: boolean;
  errorMessage?: string;
}

function truncateBody(body: unknown): unknown {
  if (body == null) return body;
  if (typeof body === "string") return body.length > 4000 ? body.slice(0, 4000) + "…[truncated]" : body;
  try {
    const str = JSON.stringify(body);
    if (str.length > 4000) return JSON.parse(str.slice(0, 4000) + "\"…[truncated]\"");
    return body;
  } catch {
    return "[unserializable]";
  }
}

async function logApiCall(entry: ApiLogEntry): Promise<void> {
  try {
    await prisma.tikTokApiLog.create({
      data: {
        workspaceId: entry.workspaceId,
        userId: entry.userId,
        method: entry.method,
        endpoint: entry.endpoint,
        requestBody: entry.requestBody == null ? undefined : (truncateBody(entry.requestBody) as object),
        responseStatus: entry.responseStatus,
        responseBody: entry.responseBody == null ? undefined : (truncateBody(entry.responseBody) as object),
        success: entry.success,
        errorMessage: entry.errorMessage,
      },
    });
  } catch (err) {
    // Logging failures must never break the API call
    console.error("[tiktok-client] Failed to write TikTokApiLog:", err);
  }
}

interface ConnectionWithTokens {
  id: string;
  workspaceId: string;
  userId: string;
  accessToken: string;
  refreshToken: string | null;
  tokenExpires: Date | null;
}

async function ensureFreshToken(conn: ConnectionWithTokens): Promise<string> {
  const expiresInMs = conn.tokenExpires ? conn.tokenExpires.getTime() - Date.now() : Infinity;
  // Refresh if token expires in < 5 minutes (TikTok access tokens last 24h)
  if (expiresInMs > 5 * 60 * 1000) return conn.accessToken;

  if (!conn.refreshToken) {
    throw new TikTokApiError({
      message: "Access token expired and no refresh token available. Reconnect TikTok.",
      httpCode: 401,
      isAuthError: true,
    });
  }

  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (!clientKey || !clientSecret) {
    throw new TikTokApiError({
      message: "TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET not configured.",
      httpCode: 500,
    });
  }

  const refreshed = await refreshAccessToken({
    refreshToken: conn.refreshToken,
    clientKey,
    clientSecret,
  });

  await prisma.platformConnection.update({
    where: { id: conn.id },
    data: {
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token,
      tokenExpires: new Date(Date.now() + refreshed.expires_in * 1000),
      scopes: refreshed.scope,
    },
  });

  return refreshed.access_token;
}

async function apiFetch<T>(
  conn: ConnectionWithTokens,
  method: "GET" | "POST",
  endpoint: string,
  body?: unknown
): Promise<T> {
  const accessToken = await ensureFreshToken(conn);
  const url = `${API_BASE}${endpoint}`;
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  let res: Response;
  let parsed: unknown;
  try {
    res = await fetch(url, init);
    const text = await res.text();
    parsed = text ? JSON.parse(text) : null;
  } catch (err) {
    await logApiCall({
      workspaceId: conn.workspaceId,
      userId: conn.userId,
      method,
      endpoint,
      requestBody: body,
      success: false,
      errorMessage: err instanceof Error ? err.message : "network error",
    });
    throw new TikTokApiError({
      message: `TikTok API network error: ${err instanceof Error ? err.message : "unknown"}`,
      httpCode: 0,
    });
  }

  await logApiCall({
    workspaceId: conn.workspaceId,
    userId: conn.userId,
    method,
    endpoint,
    requestBody: body,
    responseStatus: res.status,
    responseBody: parsed,
    success: res.ok,
    errorMessage: res.ok ? undefined : `HTTP ${res.status}`,
  });

  if (!res.ok) {
    // Pull TikTok's structured error code/message out of the envelope when
    // present so the surface error tells the user what actually failed
    // (e.g. "url_ownership_unverified") instead of a bare HTTP code.
    const env = parsed as
      | { error?: { code?: string; message?: string } }
      | null;
    const code = env?.error?.code;
    const detail = env?.error?.message;
    const suffix =
      code || detail
        ? ` — ${[code, detail].filter(Boolean).join(": ")}`
        : "";
    throw new TikTokApiError({
      message: `TikTok API error (HTTP ${res.status})${suffix}`,
      httpCode: res.status,
      responseBody: parsed,
    });
  }

  // TikTok wraps responses in a common envelope; surface errors flagged in the envelope
  // even when the HTTP status is 200.
  const envelope = parsed as { error?: { code?: string; message?: string } } | null;
  if (envelope?.error && envelope.error.code && envelope.error.code !== "ok") {
    throw new TikTokApiError({
      message: `TikTok API returned error: ${envelope.error.code} — ${envelope.error.message ?? ""}`,
      httpCode: res.status,
      responseBody: parsed,
    });
  }

  return parsed as T;
}

// ─── Resource helpers ───────────────────────────────────────────

export interface TikTokUserInfo {
  open_id: string;
  union_id?: string;
  avatar_url?: string;
  display_name?: string;
  username?: string;
}

export async function getUserInfo(conn: ConnectionWithTokens): Promise<TikTokUserInfo> {
  // `username` requires the user.info.profile scope; we only request
  // user.info.basic, so we ask for the fields that scope covers.
  // display_name is enough to identify the connected account in the UI.
  const fields = "open_id,union_id,avatar_url,display_name";
  const res = await apiFetch<{ data: { user: TikTokUserInfo } }>(
    conn,
    "GET",
    `/user/info/?fields=${fields}`
  );
  return res.data.user;
}

export interface InitDraftUploadInput {
  /** Public https URL of the video file. We fetch the bytes and upload them to TikTok via FILE_UPLOAD. */
  videoUrl: string;
}

export interface InitDraftUploadResult {
  publishId: string;
  /**
   * Verdict from TikTok at the moment we returned. "delivered" means TikTok
   * said the draft is in the inbox; "processing" means TikTok was still
   * working on it when we ran out of patience; "failed" means TikTok
   * explicitly rejected it.
   */
  verdict: "delivered" | "processing" | "failed";
  /** Last TikTok publish status we saw (e.g. SEND_TO_USER_INBOX, PROCESSING_UPLOAD). */
  lastStatus: string;
  /** Populated when verdict === "failed". */
  failReason?: string;
}

/**
 * Sends a video draft to the user's TikTok inbox using the FILE_UPLOAD source.
 *
 * Why not PULL_FROM_URL? TikTok requires the source domain to be verified in
 * the developer portal, and Popcorn videos live on their CDN — a domain we
 * can't verify. FILE_UPLOAD has no such restriction: we fetch the bytes
 * ourselves and PUT them straight to TikTok's upload URL.
 *
 * Popcorn shorts are well under TikTok's 64MB single-chunk threshold, so we
 * always upload as a single chunk (chunk_size = video_size, total_chunk_count = 1).
 */
export async function initDraftUpload(
  conn: ConnectionWithTokens,
  input: InitDraftUploadInput
): Promise<InitDraftUploadResult> {
  // 1. Fetch the video bytes from Popcorn (or wherever).
  const videoRes = await fetch(input.videoUrl);
  if (!videoRes.ok) {
    throw new TikTokApiError({
      message: `Failed to fetch source video (HTTP ${videoRes.status}) from ${input.videoUrl}`,
      httpCode: 0,
    });
  }
  const videoBytes = new Uint8Array(await videoRes.arrayBuffer());
  const videoSize = videoBytes.byteLength;
  if (videoSize === 0) {
    throw new TikTokApiError({
      message: "Source video is empty (0 bytes).",
      httpCode: 0,
    });
  }
  // TikTok caps single-chunk upload at 64MB. Popcorn shorts should always
  // be well under this, but bail early with a clear message if we ever hit
  // it instead of silently sending an invalid request.
  const SINGLE_CHUNK_MAX = 64 * 1024 * 1024;
  if (videoSize > SINGLE_CHUNK_MAX) {
    throw new TikTokApiError({
      message: `Video is ${(videoSize / 1024 / 1024).toFixed(1)}MB; single-chunk upload only supports up to 64MB.`,
      httpCode: 0,
    });
  }

  // 2. Init the upload — TikTok hands us back an upload_url.
  const init = await apiFetch<{
    data: { publish_id: string; upload_url: string };
  }>(conn, "POST", "/post/publish/inbox/video/init/", {
    source_info: {
      source: "FILE_UPLOAD",
      video_size: videoSize,
      chunk_size: videoSize,
      total_chunk_count: 1,
    },
  });

  // 3. PUT the bytes to TikTok. This endpoint is outside open.tiktokapis.com
  // so we don't use apiFetch — no bearer token, no JSON envelope.
  const uploadRes = await fetch(init.data.upload_url, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(videoSize),
      "Content-Range": `bytes 0-${videoSize - 1}/${videoSize}`,
    },
    body: videoBytes,
  });
  if (!uploadRes.ok) {
    const text = await uploadRes.text().catch(() => "");
    throw new TikTokApiError({
      message: `TikTok upload PUT failed (HTTP ${uploadRes.status})${text ? ` — ${text.slice(0, 300)}` : ""}`,
      httpCode: uploadRes.status,
    });
  }

  // 4. PUT-returned-200 only means the bytes arrived. TikTok processes the
  // video asynchronously — it can still reject it (bad codec, watermark,
  // duration, etc.) or just take its sweet time. Poll status/fetch for up to
  // 60s, then return whatever verdict we have so the caller can decide
  // whether to mark the run "posted" or keep it in an intermediate state
  // (and let the cron continue polling).
  const publishId = init.data.publish_id;
  return await checkPublishVerdict(conn, publishId, 60_000);
}

/**
 * Returns the current verdict for a TikTok publish_id without doing the
 * upload itself. Used by the cron to advance runs that came back from
 * initDraftUpload with verdict="processing".
 */
export async function checkPublishVerdict(
  conn: ConnectionWithTokens,
  publishId: string,
  timeoutMs = 0
): Promise<InitDraftUploadResult> {
  const POLL_INTERVAL_MS = 3_000;
  const started = Date.now();
  let last: PublishStatus | null = null;

  // If timeoutMs is 0 we do exactly one check (cron-friendly).
  do {
    try {
      last = await fetchPublishStatus(conn, publishId);
    } catch (err) {
      // Transient status-fetch errors shouldn't kill the run.
      console.warn(
        "[tiktok-client] status/fetch transient error:",
        err instanceof Error ? err.message : err
      );
      if (timeoutMs === 0) {
        return {
          publishId,
          verdict: "processing",
          lastStatus: "STATUS_FETCH_ERROR",
        };
      }
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    const s = last.status.toUpperCase();
    if (s === "FAILED") {
      return {
        publishId,
        verdict: "failed",
        lastStatus: s,
        failReason: last.failReason,
      };
    }
    if (
      s === "SEND_TO_USER_INBOX" ||
      s === "PUBLISH_COMPLETE" ||
      s === "PUBLISH_COMPLETE_OK"
    ) {
      return { publishId, verdict: "delivered", lastStatus: s };
    }
    if (timeoutMs === 0) break;
    await sleep(POLL_INTERVAL_MS);
  } while (Date.now() - started < timeoutMs);

  return {
    publishId,
    verdict: "processing",
    lastStatus: last?.status ?? "UNKNOWN",
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface PublishStatus {
  status: string;
  failReason?: string;
  publiclyAvailablePostId?: string[];
}

export async function fetchPublishStatus(
  conn: ConnectionWithTokens,
  publishId: string
): Promise<PublishStatus> {
  const res = await apiFetch<{
    data: {
      status: string;
      fail_reason?: string;
      publicaly_available_post_id?: string[];
      publicly_available_post_id?: string[];
    };
  }>(conn, "POST", "/post/publish/status/fetch/", { publish_id: publishId });

  return {
    status: res.data.status,
    failReason: res.data.fail_reason,
    publiclyAvailablePostId:
      res.data.publicly_available_post_id ?? res.data.publicaly_available_post_id,
  };
}

// ─── Connection loader ──────────────────────────────────────────

/**
 * Loads the currently-selected TikTok connection for the calling user.
 * Honors the per-platform cookie set when the user picks an account in
 * the UI. Falls back to the most recent active connection.
 */
export async function loadActiveConnection(
  workspaceIdOrUserId: string,
  options?: { userId?: string }
): Promise<ConnectionWithTokens | null> {
  const userId = options?.userId;
  if (userId) {
    const sel = await getCurrentConnection(userId, "tiktok");
    if (!sel || !sel.hasAccessToken) return null;
    const full = await prisma.platformConnection.findUnique({
      where: { id: sel.id },
      select: {
        id: true,
        workspaceId: true,
        userId: true,
        accessToken: true,
        refreshToken: true,
        tokenExpires: true,
      },
    });
    if (!full || !full.accessToken) return null;
    return full;
  }

  const conn = await prisma.platformConnection.findFirst({
    where: { workspaceId: workspaceIdOrUserId, platform: "tiktok", status: "active" },
    orderBy: { connectedAt: "desc" },
    select: {
      id: true,
      workspaceId: true,
      userId: true,
      accessToken: true,
      refreshToken: true,
      tokenExpires: true,
    },
  });
  if (!conn || !conn.accessToken) return null;
  return conn;
}

/**
 * Load a TikTok connection by its ID, verifying it belongs to the calling
 * user. Used when a Channel (or any scheduled job) has already chosen which
 * connection to use — bypasses the cookie-based selection so the post
 * routes to the explicitly-targeted account, not whichever one the user
 * has selected in the UI most recently.
 */
export async function loadConnectionById(
  connectionId: string,
  userId: string
): Promise<ConnectionWithTokens | null> {
  const conn = await prisma.platformConnection.findFirst({
    where: { id: connectionId, userId, platform: "tiktok" },
    select: {
      id: true,
      workspaceId: true,
      userId: true,
      accessToken: true,
      refreshToken: true,
      tokenExpires: true,
    },
  });
  if (!conn || !conn.accessToken) return null;
  return conn;
}
