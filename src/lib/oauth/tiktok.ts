import crypto from "crypto";

const TIKTOK_AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";

// Scopes we request during OAuth.
//   user.info.basic  → display name + open_id (account identity)
//   video.upload     → inbox/draft flow (kept for fallback)
//   video.publish    → Direct Post — the flow we actually use now
//
// We added video.publish on 2026-05-20 because the inbox flow gets stuck in
// PROCESSING_UPLOAD indefinitely for this sandbox — 14-for-14 uploads across
// 2 days never transitioned out of that state. The sandbox config has Direct
// Post enabled and offers the video.publish scope, so we switched to that.
// For unaudited apps, Direct Post uploads land as SELF_ONLY (private) drafts
// on the user's profile, which they can then promote to public manually.
const SCOPES = ["user.info.basic", "video.upload", "video.publish"];

export function generateState() {
  return crypto.randomBytes(16).toString("hex");
}

export function buildAuthUrl(params: {
  clientKey: string;
  redirectUri: string;
  state: string;
}) {
  const url = new URL(TIKTOK_AUTH_URL);
  // TikTok uses client_key in the auth URL (not client_id)
  url.searchParams.set("client_key", params.clientKey);
  url.searchParams.set("response_type", "code");
  // TikTok expects scopes comma-separated, NOT space-separated
  url.searchParams.set("scope", SCOPES.join(","));
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  return url.toString();
}

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  open_id: string;
  refresh_expires_in: number;
  refresh_token: string;
  scope: string;
  token_type: string;
}

export async function exchangeCode(params: {
  code: string;
  clientKey: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_key: params.clientKey,
    client_secret: params.clientSecret,
    code: params.code,
    grant_type: "authorization_code",
    redirect_uri: params.redirectUri,
  });

  const res = await fetch(TIKTOK_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cache-Control": "no-cache",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(
      `TikTok token exchange failed (HTTP ${res.status}): ${errBody.slice(0, 300)}`
    );
  }

  const data = (await res.json()) as TokenResponse & { error?: string; error_description?: string };
  if (data.error) {
    throw new Error(
      `TikTok token exchange error: ${data.error} — ${data.error_description ?? ""}`
    );
  }
  return data;
}

export async function refreshAccessToken(params: {
  refreshToken: string;
  clientKey: string;
  clientSecret: string;
}): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_key: params.clientKey,
    client_secret: params.clientSecret,
    grant_type: "refresh_token",
    refresh_token: params.refreshToken,
  });

  const res = await fetch(TIKTOK_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cache-Control": "no-cache",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(
      `TikTok token refresh failed (HTTP ${res.status}): ${errBody.slice(0, 300)}`
    );
  }

  const data = (await res.json()) as TokenResponse & { error?: string; error_description?: string };
  if (data.error) {
    throw new Error(
      `TikTok token refresh error: ${data.error} — ${data.error_description ?? ""}`
    );
  }
  return data;
}

export { SCOPES as TIKTOK_OAUTH_SCOPES };
