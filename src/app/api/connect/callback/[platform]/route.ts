import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as xOAuth from "@/lib/oauth/x";
import * as linkedinOAuth from "@/lib/oauth/linkedin";
import { getUserProfile as getXProfile } from "@/lib/platform/x-client";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const userId = request.cookies.get("oauth_user_id")?.value;
  if (!userId) {
    console.error("OAuth callback: missing oauth_user_id cookie");
    return NextResponse.redirect(new URL("/login", request.url));
  }

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

  try {
    if (platform === "x") {
      const storedState = request.cookies.get("x_oauth_state")?.value;
      const codeVerifier = request.cookies.get("x_code_verifier")?.value;

      if (!storedState || state !== storedState || !codeVerifier) {
        return NextResponse.redirect(
          new URL("/connections?error=invalid_state", request.url)
        );
      }

      const tokens = await xOAuth.exchangeCode({
        code,
        codeVerifier,
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

      const response = NextResponse.redirect(
        new URL("/connections?connected=x", request.url)
      );
      response.cookies.delete("x_oauth_state");
      response.cookies.delete("x_code_verifier");
      response.cookies.delete("oauth_user_id");
      return response;
    }

    if (platform === "linkedin") {
      const storedState = request.cookies.get("linkedin_oauth_state")?.value;

      if (!storedState || state !== storedState) {
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

      const response = NextResponse.redirect(
        new URL("/connections?connected=linkedin", request.url)
      );
      response.cookies.delete("linkedin_oauth_state");
      response.cookies.delete("oauth_user_id");
      return response;
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
