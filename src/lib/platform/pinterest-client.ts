import { prisma } from "@/lib/prisma";
import { refreshAccessToken } from "@/lib/oauth/pinterest";
import { getCurrentConnection } from "@/lib/connection-context";

const API_BASE = "https://api.pinterest.com/v5";

export class PinterestApiError extends Error {
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
    this.name = "PinterestApiError";
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
    return str.length > 4000
      ? JSON.parse(JSON.stringify(body, null, 0)).toString().slice(0, 4000) + "…[truncated]"
      : body;
  } catch {
    return "[unserializable]";
  }
}

async function logApiCall(entry: ApiLogEntry): Promise<void> {
  try {
    await prisma.pinterestApiLog.create({
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
    console.error("[pinterest-client] Failed to write PinterestApiLog:", err);
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
  // Refresh if token expires in < 5 minutes
  if (expiresInMs > 5 * 60 * 1000) return conn.accessToken;

  if (!conn.refreshToken) {
    throw new PinterestApiError({
      message: "Access token expired and no refresh token available. Reconnect Pinterest.",
      httpCode: 401,
      isAuthError: true,
    });
  }

  const clientId = process.env.PINTEREST_CLIENT_ID;
  const clientSecret = process.env.PINTEREST_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new PinterestApiError({
      message: "PINTEREST_CLIENT_ID / PINTEREST_CLIENT_SECRET not configured.",
      httpCode: 500,
    });
  }

  const refreshed = await refreshAccessToken({
    refreshToken: conn.refreshToken,
    clientId,
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
  method: "GET" | "POST" | "PATCH" | "DELETE",
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
    throw new PinterestApiError({
      message: `Pinterest API network error: ${err instanceof Error ? err.message : "unknown"}`,
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
    throw new PinterestApiError({
      message: `Pinterest API error (HTTP ${res.status})`,
      httpCode: res.status,
      responseBody: parsed,
    });
  }

  return parsed as T;
}

// ─── Resource helpers ───────────────────────────────────────────

export interface PinterestUserAccount {
  username: string;
  account_type: string;
  profile_image: string | null;
  website_url: string | null;
}

export async function getUserAccount(conn: ConnectionWithTokens): Promise<PinterestUserAccount> {
  return apiFetch<PinterestUserAccount>(conn, "GET", "/user_account");
}

export interface PinterestBoard {
  id: string;
  name: string;
  description: string | null;
  privacy: string;
  pin_count?: number;
}

export interface ListBoardsResponse {
  items: PinterestBoard[];
  bookmark?: string | null;
}

export async function listBoards(conn: ConnectionWithTokens, pageSize = 100): Promise<PinterestBoard[]> {
  const out: PinterestBoard[] = [];
  let bookmark: string | undefined;
  for (let i = 0; i < 5; i++) {
    const qs = new URLSearchParams({ page_size: String(pageSize) });
    if (bookmark) qs.set("bookmark", bookmark);
    const res = await apiFetch<ListBoardsResponse>(conn, "GET", `/boards?${qs.toString()}`);
    out.push(...res.items);
    if (!res.bookmark) break;
    bookmark = res.bookmark;
  }
  return out;
}

export interface CreatePinInput {
  boardId: string;
  title: string;
  description: string;
  imageUrl: string;
  link?: string;
  altText?: string;
}

export interface CreatePinResponse {
  id: string;
  link: string | null;
  title: string;
  description: string;
  board_id: string;
}

export async function createPin(
  conn: ConnectionWithTokens,
  input: CreatePinInput
): Promise<CreatePinResponse> {
  const body = {
    board_id: input.boardId,
    title: input.title,
    description: input.description,
    ...(input.link && { link: input.link }),
    ...(input.altText && { alt_text: input.altText }),
    media_source: {
      source_type: "image_url",
      url: input.imageUrl,
    },
  };
  return apiFetch<CreatePinResponse>(conn, "POST", "/pins", body);
}

// ─── Connection loader ──────────────────────────────────────────

/**
 * Loads the currently-selected Pinterest connection for the calling user.
 * The selection comes from the per-platform cookie (set when the user picks
 * an account in the UI). Falls back to the most recent active connection.
 *
 * `workspaceId` is no longer used for selection (the user-facing model is
 * platform-first, multi-account), but the param is kept for callers that
 * have already resolved a workspace context.
 */
export async function loadActiveConnection(
  workspaceIdOrUserId: string,
  options?: { userId?: string }
): Promise<ConnectionWithTokens | null> {
  // Backwards-compatible: if called with just workspaceId (legacy), still
  // works via the workspace lookup path. New callers should pass userId.
  const userId = options?.userId;
  if (userId) {
    const sel = await getCurrentConnection(userId, "pinterest");
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
    where: { workspaceId: workspaceIdOrUserId, platform: "pinterest", status: "active" },
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
