import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as xOAuth from "@/lib/oauth/x";
import { getUserProfile as getXProfile } from "@/lib/platform/x-client";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform } = await params;
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/connections?error=${encodeURIComponent(error)}`, request.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/connections?error=missing_params", request.url)
    );
  }

  // Look up OAuth state from database instead of cookies
  const oauthState = await prisma.oAuthState.findUnique({
    where: { state },
  });

  if (!oauthState || oauthState.expiresAt < new Date()) {
    // Clean up expired state if found
    if (oauthState) {
      await prisma.oAuthState.delete({ where: { id: oauthState.id } });
    }
    console.error("OAuth callback: invalid or expired state");
    return NextResponse.redirect(
      new URL("/connections?error=invalid_state", request.url)
    );
  }

  const userId = oauthState.userId;
  const returnTo = oauthState.returnTo;

  // Delete the state record (single-use)
  await prisma.oAuthState.delete({ where: { id: oauthState.id } });

  try {
    if (platform === "x") {
      if (oauthState.platform !== "x" || !oauthState.codeVerifier) {
        return NextResponse.redirect(
          new URL("/connections?error=invalid_state", request.url)
        );
      }

      const tokens = await xOAuth.exchangeCode({
        code,
        codeVerifier: oauthState.codeVerifier,
        clientId: process.env.X_CLIENT_ID!,
        clientSecret: process.env.X_CLIENT_SECRET!,
        redirectUri: process.env.X_CALLBACK_URL!,
      });

      const profile = await getXProfile(tokens.access_token);

      // Check if this X account is already connected (reconnection vs new account)
      const existing = await prisma.platformConnection.findFirst({
        where: { userId, platform: "x", accountId: profile.id },
      });

      let connectionId: string;

      if (existing) {
        // Reconnecting same account — update tokens
        await prisma.platformConnection.update({
          where: { id: existing.id },
          data: {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            accountHandle: profile.username,
            tokenExpires: new Date(Date.now() + tokens.expires_in * 1000),
            status: "active",
          },
        });
        connectionId = existing.id;
      } else {
        // New account — create a new connection
        const created = await prisma.platformConnection.create({
          data: {
            userId,
            platform: "x",
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            accountHandle: profile.username,
            accountId: profile.id,
            tokenExpires: new Date(Date.now() + tokens.expires_in * 1000),
          },
        });
        connectionId = created.id;
      }

      // Redirect to cookie setup page so users complete step 2
      const xRedirect = returnTo ?? `/connections/x/cookie-setup?connectionId=${connectionId}`;
      return NextResponse.redirect(
        new URL(xRedirect, request.url)
      );
    }

    return NextResponse.redirect(
      new URL("/connections?error=unsupported_platform", request.url)
    );
  } catch (err) {
    console.error(`OAuth callback error for ${platform}:`, err);
    return NextResponse.redirect(
      new URL("/connections?error=token_exchange_failed", request.url)
    );
  }
}
