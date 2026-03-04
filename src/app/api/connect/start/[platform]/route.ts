import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as xOAuth from "@/lib/oauth/x";
import * as linkedinOAuth from "@/lib/oauth/linkedin";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { platform } = await params;

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
        platform: "x",
        codeVerifier,
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

  if (platform === "linkedin") {
    const clientId = process.env.LINKEDIN_CLIENT_ID!;
    const redirectUri = process.env.LINKEDIN_CALLBACK_URL!;
    const state = linkedinOAuth.generateState();

    await prisma.oAuthState.create({
      data: {
        state,
        userId: session.user.id,
        platform: "linkedin",
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    const authUrl = linkedinOAuth.buildAuthUrl({
      clientId,
      redirectUri,
      state,
    });

    return NextResponse.redirect(authUrl);
  }

  return NextResponse.json(
    { error: "Unsupported platform" },
    { status: 400 }
  );
}
