import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  TIKTOK_OAUTH_SCOPES,
  buildAuthUrl,
  generateState,
} from "@/lib/oauth/tiktok";

/**
 * Debug endpoint — returns the resolved TikTok OAuth config + the generated
 * authorization URL so we can see exactly what the server is sending to TikTok.
 * Authenticated; no side effects.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientKey = process.env.TIKTOK_CLIENT_KEY ?? null;
  const redirectUri = process.env.TIKTOK_CALLBACK_URL ?? null;
  const clientSecretPresent = !!process.env.TIKTOK_CLIENT_SECRET;

  let authUrl: string | null = null;
  let parsedParams: Record<string, string> | null = null;

  if (clientKey && redirectUri) {
    const state = generateState();
    authUrl = buildAuthUrl({ clientKey, redirectUri, state });
    const url = new URL(authUrl);
    parsedParams = Object.fromEntries(url.searchParams.entries());
  }

  return NextResponse.json({
    env: {
      TIKTOK_CLIENT_KEY: clientKey,
      TIKTOK_CLIENT_KEY_length: clientKey?.length ?? 0,
      TIKTOK_CALLBACK_URL: redirectUri,
      TIKTOK_CLIENT_SECRET_present: clientSecretPresent,
    },
    config: {
      scopes_requested: TIKTOK_OAUTH_SCOPES,
      response_type: "code",
    },
    generated: {
      authUrl,
      parsedParams,
    },
    expected: {
      client_key_should_match: "the Client Key shown in your TikTok Developer Portal app's Login Kit section",
      callback_url: "https://xponential-two.vercel.app/api/connect/callback/tiktok",
      scopes: "user.info.basic, video.upload (comma-separated, in that order)",
    },
  });
}
