import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import * as xOAuth from "@/lib/oauth/x";
import * as linkedinOAuth from "@/lib/oauth/linkedin";
import { cookies } from "next/headers";

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

    const cookieStore = await cookies();
    cookieStore.set("x_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });
    cookieStore.set("x_code_verifier", codeVerifier, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
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

    const cookieStore = await cookies();
    cookieStore.set("linkedin_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
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
