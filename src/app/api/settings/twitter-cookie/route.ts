import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Resolve which X connection to operate on. Accepts ?connectionId=X for
 * multi-account use; falls back to the user's first active X connection
 * for legacy single-account callers.
 */
async function resolveConnection(userId: string, request: NextRequest) {
  const cid = request.nextUrl.searchParams.get("connectionId");
  if (cid) {
    return prisma.platformConnection.findFirst({
      where: { id: cid, userId, platform: "x" },
    });
  }
  return prisma.platformConnection.findFirst({
    where: { userId, platform: "x", status: "active" },
    orderBy: { connectedAt: "desc" },
  });
}

/**
 * GET /api/settings/twitter-cookie?connectionId=X
 * Returns whether a Twitter cookie is configured (not the cookie itself for security).
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connection = await resolveConnection(session.user.id, request);

  return NextResponse.json({
    connectionId: connection?.id ?? null,
    accountHandle: connection?.accountHandle ?? null,
    hasCookie: !!connection?.twitterCookie,
    cookiePreview: connection?.twitterCookie
      ? connection.twitterCookie.substring(0, 40) + "..."
      : null,
  });
}

/**
 * PUT /api/settings/twitter-cookie?connectionId=X
 * Saves the Twitter cookie to the specified X platform connection.
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

  if (!cookie.includes("ct0=")) {
    return NextResponse.json(
      {
        error:
          'Cookie is missing the ct0 token. Make sure you export as "Header String" from Cookie-Editor, not just the auth_token value.',
      },
      { status: 400 }
    );
  }

  const connection = await resolveConnection(session.user.id, request);
  if (!connection) {
    return NextResponse.json(
      {
        error:
          "X account not connected. Please connect your X account first in Connections.",
      },
      { status: 404 }
    );
  }

  await prisma.platformConnection.update({
    where: { id: connection.id },
    data: { twitterCookie: cookie.trim() },
  });

  return NextResponse.json({ success: true, connectionId: connection.id });
}

/**
 * DELETE /api/settings/twitter-cookie?connectionId=X
 * Removes the stored Twitter cookie from the specified connection.
 */
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connection = await resolveConnection(session.user.id, request);
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
