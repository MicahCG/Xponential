import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as xOAuth from "@/lib/oauth/x";
import * as linkedinOAuth from "@/lib/oauth/linkedin";
import { getUserProfile as getXProfile } from "@/lib/platform/x-client";
import { cookies } from "next/headers";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
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

  const cookieStore = await cookies();

  try {
    if (platform === "x") {
      const storedState = cookieStore.get("x_oauth_state")?.value;
      const codeVerifier = cookieStore.get("x_code_verifier")?.value;

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
            userId: session.user.id,
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
          userId: session.user.id,
          platform: "x",
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          accountHandle: profile.username,
          accountId: profile.id,
          tokenExpires: new Date(Date.now() + tokens.expires_in * 1000),
        },
      });

      cookieStore.delete("x_oauth_state");
      cookieStore.delete("x_code_verifier");

      return NextResponse.redirect(
        new URL("/connections?connected=x", request.url)
      );
    }

    if (platform === "linkedin") {
      const storedState = cookieStore.get("linkedin_oauth_state")?.value;

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
            userId: session.user.id,
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
          userId: session.user.id,
          platform: "linkedin",
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token ?? null,
          accountHandle: profile.name,
          accountId: profile.sub,
          tokenExpires: new Date(Date.now() + tokens.expires_in * 1000),
        },
      });

      cookieStore.delete("linkedin_oauth_state");

      return NextResponse.redirect(
        new URL("/connections?connected=linkedin", request.url)
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
