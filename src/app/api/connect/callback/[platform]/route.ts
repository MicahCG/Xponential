import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as xOAuth from "@/lib/oauth/x";
import * as linkedinOAuth from "@/lib/oauth/linkedin";
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

      await prisma.platformConnection.upsert({
        where: {
          userId_platform: {
            userId,
            platform: "x",
          },
        },
        update: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          accountHandle: profile.username,
          accountId: profile.id,
          tokenExpires: new Date(Date.now() + tokens.expires_in * 1000),
          status: "active",
        },
        create: {
          userId,
          platform: "x",
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          accountHandle: profile.username,
          accountId: profile.id,
          tokenExpires: new Date(Date.now() + tokens.expires_in * 1000),
        },
      });

      // Redirect to cookie setup page so users complete step 2
      const xRedirect = returnTo ?? "/connections/x/cookie-setup";
      return NextResponse.redirect(
        new URL(xRedirect, request.url)
      );
    }

    if (platform === "linkedin") {
      if (oauthState.platform !== "linkedin") {
        return NextResponse.redirect(
          new URL("/connections?error=invalid_state", request.url)
        );
      }

      const tokens = await linkedinOAuth.exchangeCode({
        code,
        clientId: process.env.LINKEDIN_CLIENT_ID!,
        clientSecret: process.env.LINKEDIN_CLIENT_SECRET!,
        redirectUri: process.env.LINKEDIN_CALLBACK_URL!,
      });

      const profile = await linkedinOAuth.getUserProfile(tokens.access_token);

      await prisma.platformConnection.upsert({
        where: {
          userId_platform: {
            userId,
            platform: "linkedin",
          },
        },
        update: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token ?? null,
          accountHandle: profile.name,
          accountId: profile.sub,
          tokenExpires: new Date(Date.now() + tokens.expires_in * 1000),
          status: "active",
        },
        create: {
          userId,
          platform: "linkedin",
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token ?? null,
          accountHandle: profile.name,
          accountId: profile.sub,
          tokenExpires: new Date(Date.now() + tokens.expires_in * 1000),
        },
      });

      const linkedinRedirect = returnTo ?? "/connections";
      return NextResponse.redirect(
        new URL(`${linkedinRedirect}?connected=linkedin`, request.url)
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
