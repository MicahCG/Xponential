import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as xOAuth from "@/lib/oauth/x";
import * as pinterestOAuth from "@/lib/oauth/pinterest";
import * as tiktokOAuth from "@/lib/oauth/tiktok";
import { getCurrentBrand } from "@/lib/brand-context";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { platform } = await params;
  const brand = await getCurrentBrand(session.user.id);

  const returnTo = request.nextUrl.searchParams.get("returnTo") || null;

  if (platform === "x") {
    const clientId = process.env.X_CLIENT_ID!;
    const redirectUri = process.env.X_CALLBACK_URL!;
    const state = xOAuth.generateState();
    const { codeVerifier, codeChallenge } = xOAuth.generatePKCE();

    // Store OAuth state in database (cookies are unreliable across redirects)
    await prisma.oAuthState.create({
      data: {
        state,
        userId: session.user.id,
        brandId: brand.id,
        platform: "x",
        codeVerifier,
        returnTo,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      },
    });

    const authUrl = xOAuth.buildAuthUrl({
      clientId,
      redirectUri,
      state,
      codeChallenge,
    });

    return NextResponse.redirect(authUrl);
  }

  if (platform === "pinterest") {
    const clientId = process.env.PINTEREST_CLIENT_ID;
    const clientSecretConfigured = !!process.env.PINTEREST_CLIENT_SECRET;
    const redirectUri = process.env.PINTEREST_CALLBACK_URL;

    if (!clientId || !redirectUri || !clientSecretConfigured) {
      const missing = [
        !clientId && "PINTEREST_CLIENT_ID",
        !clientSecretConfigured && "PINTEREST_CLIENT_SECRET",
        !redirectUri && "PINTEREST_CALLBACK_URL",
      ]
        .filter(Boolean)
        .join(", ");
      console.error(`[pinterest-oauth] Missing env vars: ${missing}`);
      return NextResponse.json(
        {
          error: `Pinterest OAuth is not configured. Missing env: ${missing}`,
        },
        { status: 500 }
      );
    }

    const state = pinterestOAuth.generateState();

    await prisma.oAuthState.create({
      data: {
        state,
        userId: session.user.id,
        brandId: brand.id,
        platform: "pinterest",
        returnTo,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    const authUrl = pinterestOAuth.buildAuthUrl({ clientId, redirectUri, state });

    // Server-side diagnostic log (no secret in the URL, so this is safe).
    // Client secret is only used in the POST /v5/oauth/token exchange.
    console.log("[pinterest-oauth] Authorization URL built:", {
      clientId,
      clientIdLength: clientId.length,
      redirectUri,
      redirectUriEncoded: encodeURIComponent(redirectUri),
      responseType: "code",
      scopes: pinterestOAuth.PINTEREST_OAUTH_SCOPES,
      state,
      authUrl,
      secretConfigured: clientSecretConfigured,
    });

    return NextResponse.redirect(authUrl);
  }

  if (platform === "tiktok") {
    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    const clientSecretConfigured = !!process.env.TIKTOK_CLIENT_SECRET;
    const redirectUri = process.env.TIKTOK_CALLBACK_URL;

    if (!clientKey || !redirectUri || !clientSecretConfigured) {
      const missing = [
        !clientKey && "TIKTOK_CLIENT_KEY",
        !clientSecretConfigured && "TIKTOK_CLIENT_SECRET",
        !redirectUri && "TIKTOK_CALLBACK_URL",
      ]
        .filter(Boolean)
        .join(", ");
      console.error(`[tiktok-oauth] Missing env vars: ${missing}`);
      return NextResponse.json(
        { error: `TikTok OAuth is not configured. Missing env: ${missing}` },
        { status: 500 }
      );
    }

    const state = tiktokOAuth.generateState();

    await prisma.oAuthState.create({
      data: {
        state,
        userId: session.user.id,
        brandId: brand.id,
        platform: "tiktok",
        returnTo,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    const authUrl = tiktokOAuth.buildAuthUrl({ clientKey, redirectUri, state });

    console.log("[tiktok-oauth] Authorization URL built:", {
      clientKey,
      clientKeyLength: clientKey.length,
      redirectUri,
      responseType: "code",
      scopes: tiktokOAuth.TIKTOK_OAUTH_SCOPES,
      state,
      authUrl,
      secretConfigured: clientSecretConfigured,
    });

    return NextResponse.redirect(authUrl);
  }

  return NextResponse.json(
    { error: "Unsupported platform" },
    { status: 400 }
  );
}
