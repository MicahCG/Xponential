import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/settings/twitter-cookie
 * Returns whether a Twitter cookie is configured (not the cookie itself for security).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connection = await prisma.platformConnection.findFirst({
    where: { userId: session.user.id, platform: "x", status: "active" },
    select: { twitterCookie: true },
  });

  return NextResponse.json({
    hasCookie: !!connection?.twitterCookie,
    // Show a preview so the user knows which cookie is stored
    cookiePreview: connection?.twitterCookie
      ? connection.twitterCookie.substring(0, 40) + "..."
      : null,
  });
}

/**
 * PUT /api/settings/twitter-cookie
 * Saves the Twitter cookie to the user's X platform connection.
 */
export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { cookie } = body as { cookie?: string };

  if (!cookie || cookie.trim().length === 0) {
    return NextResponse.json(
      { error: "Cookie value is required" },
      { status: 400 }
    );
  }

  // Must be the full Header String format — needs both auth_token and ct0
  if (!cookie.includes("ct0=")) {
    return NextResponse.json(
      {
        error:
          'Cookie is missing the ct0 token. Make sure you export as "Header String" from Cookie-Editor, not just the auth_token value.',
      },
      { status: 400 }
    );
  }

  // Find the user's X platform connection
  const connection = await prisma.platformConnection.findFirst({
    where: { userId: session.user.id, platform: "x", status: "active" },
  });

  if (!connection) {
    return NextResponse.json(
      {
        error:
          "X account not connected. Please connect your X account first in Connections.",
      },
      { status: 404 }
    );
  }

  // Save the cookie
  await prisma.platformConnection.update({
    where: { id: connection.id },
    data: { twitterCookie: cookie.trim() },
  });

  return NextResponse.json({ success: true });
}

/**
 * DELETE /api/settings/twitter-cookie
 * Removes the stored Twitter cookie.
 */
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connection = await prisma.platformConnection.findFirst({
    where: { userId: session.user.id, platform: "x", status: "active" },
  });

  if (!connection) {
    return NextResponse.json(
      { error: "X account not connected" },
      { status: 404 }
    );
  }

  await prisma.platformConnection.update({
    where: { id: connection.id },
    data: { twitterCookie: null },
  });

  return NextResponse.json({ success: true });
}
