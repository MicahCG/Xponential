import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as xOAuth from "@/lib/oauth/x";
import * as pinterestOAuth from "@/lib/oauth/pinterest";
import * as tiktokOAuth from "@/lib/oauth/tiktok";
import { getUserProfile as getXProfile } from "@/lib/platform/x-client";
import { getUserAccount as getPinterestProfile } from "@/lib/platform/pinterest-client";
import { getUserInfo as getTikTokUserInfo } from "@/lib/platform/tiktok-client";
import { getDefaultBrandForUser } from "@/lib/brand-context";

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
  // Fallback for legacy OAuthState rows started before brandId was captured
  const brandId =
    oauthState.brandId ?? (await getDefaultBrandForUser(userId)).id;
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
            brandId,
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

    if (platform === "pinterest") {
      if (oauthState.platform !== "pinterest") {
        return NextResponse.redirect(
          new URL("/connections/pinterest?error=invalid_state", request.url)
        );
      }

      const clientId = process.env.PINTEREST_CLIENT_ID!;
      const clientSecret = process.env.PINTEREST_CLIENT_SECRET!;
      const redirectUri = process.env.PINTEREST_CALLBACK_URL!;

      const tokens = await pinterestOAuth.exchangeCode({
        code,
        clientId,
        clientSecret,
        redirectUri,
      });

      // Pinterest doesn't always return a stable account id we can dedupe on
      // in the token response, so we fetch the user_account ourselves.
      // Create a temporary connection-shaped object so the client helper works
      // before we persist the row.
      const tempConn = {
        id: "pending",
        brandId,
        userId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpires: new Date(Date.now() + tokens.expires_in * 1000),
      };
      const profile = await getPinterestProfile(tempConn);
      const username = profile.username;

      const existing = await prisma.platformConnection.findFirst({
        where: { userId, platform: "pinterest", accountId: username },
      });

      const tokenExpires = new Date(Date.now() + tokens.expires_in * 1000);
      const connectionRow = existing
        ? await prisma.platformConnection.update({
            where: { id: existing.id },
            data: {
              brandId,
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token,
              tokenExpires,
              scopes: tokens.scope,
              accountHandle: username,
              status: "active",
            },
            select: { id: true },
          })
        : await prisma.platformConnection.create({
            data: {
              userId,
              brandId,
              platform: "pinterest",
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token,
              tokenExpires,
              scopes: tokens.scope,
              accountHandle: username,
              accountId: username,
            },
            select: { id: true },
          });

      const pinRedirect =
        returnTo ?? `/connections/pinterest?connected=1&id=${connectionRow.id}`;
      return NextResponse.redirect(new URL(pinRedirect, request.url));
    }

    if (platform === "tiktok") {
      if (oauthState.platform !== "tiktok") {
        return NextResponse.redirect(
          new URL("/connections/tiktok?error=invalid_state", request.url)
        );
      }

      const clientKey = process.env.TIKTOK_CLIENT_KEY!;
      const clientSecret = process.env.TIKTOK_CLIENT_SECRET!;
      const redirectUri = process.env.TIKTOK_CALLBACK_URL!;

      const tokens = await tiktokOAuth.exchangeCode({
        code,
        clientKey,
        clientSecret,
        redirectUri,
      });

      // Fetch the user's profile so we can store display name + open_id
      const tempConn = {
        id: "pending",
        brandId,
        userId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpires: new Date(Date.now() + tokens.expires_in * 1000),
      };
      const profile = await getTikTokUserInfo(tempConn);
      const openId = profile.open_id ?? tokens.open_id;
      const displayHandle = profile.username || profile.display_name || openId;

      const existing = await prisma.platformConnection.findFirst({
        where: { userId, platform: "tiktok", accountId: openId },
      });

      const tokenExpires = new Date(Date.now() + tokens.expires_in * 1000);
      const connectionRow = existing
        ? await prisma.platformConnection.update({
            where: { id: existing.id },
            data: {
              brandId,
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token,
              tokenExpires,
              scopes: tokens.scope,
              accountHandle: displayHandle,
              status: "active",
            },
            select: { id: true },
          })
        : await prisma.platformConnection.create({
            data: {
              userId,
              brandId,
              platform: "tiktok",
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token,
              tokenExpires,
              scopes: tokens.scope,
              accountHandle: displayHandle,
              accountId: openId,
            },
            select: { id: true },
          });

      const tiktokRedirect =
        returnTo ?? `/connections/tiktok?connected=1&id=${connectionRow.id}`;
      return NextResponse.redirect(new URL(tiktokRedirect, request.url));
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
