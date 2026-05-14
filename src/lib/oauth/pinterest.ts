import crypto from "crypto";

const PINTEREST_AUTH_URL = "https://www.pinterest.com/oauth/";
const PINTEREST_TOKEN_URL = "https://api.pinterest.com/v5/oauth/token";

// Production scope set — includes pins:write so brand owners can publish.
// Read-only handshake was verified end-to-end first; write scope added back
// once we confirmed the OAuth flow itself was healthy.
const SCOPES = [
  "user_accounts:read",
  "boards:read",
  "pins:read",
  "pins:write",
];

export function generateState() {
  return crypto.randomBytes(16).toString("hex");
}

export function buildAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
}) {
  const url = new URL(PINTEREST_AUTH_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("scope", SCOPES.join(","));
  url.searchParams.set("state", params.state);
  return url.toString();
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_token_expires_in?: number;
  token_type: string;
  scope: string;
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  const creds = `${clientId}:${clientSecret}`;
  return "Basic " + Buffer.from(creds).toString("base64");
}

export async function exchangeCode(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
  });

  const res = await fetch(PINTEREST_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(params.clientId, params.clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(
      `Pinterest token exchange failed (HTTP ${res.status}): ${errBody.slice(0, 300)}`
    );
  }

  return (await res.json()) as TokenResponse;
}

export async function refreshAccessToken(params: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: params.refreshToken,
  });

  const res = await fetch(PINTEREST_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(params.clientId, params.clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(
      `Pinterest token refresh failed (HTTP ${res.status}): ${errBody.slice(0, 300)}`
    );
  }

  return (await res.json()) as TokenResponse;
}

export { SCOPES as PINTEREST_OAUTH_SCOPES };
