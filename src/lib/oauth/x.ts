import crypto from "crypto";
import { TwitterApi } from "twitter-api-v2";

const X_AUTH_URL = "https://twitter.com/i/oauth2/authorize";
const X_TOKEN_URL = "https://api.twitter.com/2/oauth2/token";
const X_REVOKE_URL = "https://api.twitter.com/2/oauth2/revoke";

// Note: like.read and follows.read can be added once enabled in Twitter Developer Portal
// The ingestion gracefully falls back if those scopes aren't available
const SCOPES = [
  "tweet.read",
  "tweet.write",
  "users.read",
  "offline.access",
];

export function generatePKCE() {
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return { codeVerifier, codeChallenge };
}

export function generateState() {
  return crypto.randomBytes(16).toString("hex");
}

export function buildAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}) {
  const url = new URL(X_AUTH_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("scope", SCOPES.join(" "));
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export async function exchangeCode(params: {
  code: string;
  codeVerifier: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}) {
  const client = new TwitterApi({
    clientId: params.clientId,
    clientSecret: params.clientSecret,
  });

  const result = await client.loginWithOAuth2({
    code: params.code,
    codeVerifier: params.codeVerifier,
    redirectUri: params.redirectUri,
  });

  return {
    access_token: result.accessToken,
    refresh_token: result.refreshToken!,
    expires_in: result.expiresIn,
    token_type: "bearer",
    scope: result.scope.join(" "),
  };
}

export async function refreshAccessToken(params: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}) {
  const client = new TwitterApi({
    clientId: params.clientId,
    clientSecret: params.clientSecret,
  });

  const result = await client.refreshOAuth2Token(params.refreshToken);

  return {
    access_token: result.accessToken,
    refresh_token: result.refreshToken!,
    expires_in: result.expiresIn,
  };
}

export async function revokeToken(params: {
  token: string;
  clientId: string;
  clientSecret: string;
}) {
  const client = new TwitterApi({
    clientId: params.clientId,
    clientSecret: params.clientSecret,
  });

  await client.revokeOAuth2Token(params.token, "access_token");
}
