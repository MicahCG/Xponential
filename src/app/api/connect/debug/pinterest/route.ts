import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { PINTEREST_OAUTH_SCOPES, buildAuthUrl, generateState } from "@/lib/oauth/pinterest";

/**
 * Debug endpoint — returns the *generated* Pinterest OAuth authorization URL
 * along with the config the server resolved, without leaking the client secret.
 *
 * Useful for verifying:
 *   - PINTEREST_CLIENT_ID is the exact value you expect (no whitespace, no typo)
 *   - PINTEREST_CALLBACK_URL is the exact value registered on Pinterest's side
 *   - PINTEREST_CLIENT_SECRET is configured (presence only, never the value)
 *   - scope, response_type, redirect_uri encoding all match what we send
 *
 * Authenticated; does not write or persist anything.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientId = process.env.PINTEREST_CLIENT_ID ?? null;
  const redirectUri = process.env.PINTEREST_CALLBACK_URL ?? null;
  const clientSecretPresent = !!process.env.PINTEREST_CLIENT_SECRET;

  let authUrl: string | null = null;
  let parsedParams: Record<string, string> | null = null;

  if (clientId && redirectUri) {
    const state = generateState();
    authUrl = buildAuthUrl({ clientId, redirectUri, state });
    const url = new URL(authUrl);
    parsedParams = Object.fromEntries(url.searchParams.entries());
  }

  return NextResponse.json({
    env: {
      PINTEREST_CLIENT_ID: clientId,
      PINTEREST_CLIENT_ID_length: clientId?.length ?? 0,
      PINTEREST_CALLBACK_URL: redirectUri,
      PINTEREST_CLIENT_SECRET_present: clientSecretPresent,
    },
    config: {
      scopes_requested: PINTEREST_OAUTH_SCOPES,
      response_type: "code",
    },
    generated: {
      authUrl,
      parsedParams,
    },
    expected: {
      client_id_from_dashboard: "1525270",
      callback_url: "https://xponential-two.vercel.app/api/connect/callback/pinterest",
      scopes_initial: "user_accounts:read,boards:read,pins:read",
    },
  });
}
