import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import * as xOAuth from "@/lib/oauth/x";
import * as linkedinOAuth from "@/lib/oauth/linkedin";

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 600,
  path: "/",
};

function htmlRedirect(url: string) {
  return `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=${url}"></head><body>Redirecting...</body></html>`;
}

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

    const authUrl = xOAuth.buildAuthUrl({
      clientId,
      redirectUri,
      state,
      codeChallenge,
    });

    const response = new NextResponse(htmlRedirect(authUrl), {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });
    response.cookies.set("oauth_user_id", session.user.id, cookieOptions);
    response.cookies.set("x_oauth_state", state, cookieOptions);
    response.cookies.set("x_code_verifier", codeVerifier, cookieOptions);
    return response;
  }

  if (platform === "linkedin") {
    const clientId = process.env.LINKEDIN_CLIENT_ID!;
    const redirectUri = process.env.LINKEDIN_CALLBACK_URL!;
    const state = linkedinOAuth.generateState();

    const authUrl = linkedinOAuth.buildAuthUrl({
      clientId,
      redirectUri,
      state,
    });

    const response = new NextResponse(htmlRedirect(authUrl), {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });
    response.cookies.set("oauth_user_id", session.user.id, cookieOptions);
    response.cookies.set("linkedin_oauth_state", state, cookieOptions);
    return response;
  }

  return NextResponse.json(
    { error: "Unsupported platform" },
    { status: 400 }
  );
}
