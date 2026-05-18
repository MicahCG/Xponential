import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspace-context";

const connectSchema = z.object({
  accountHandle: z.string().trim().min(1).max(50),
  pinterestCookie: z.string().trim().min(20),
});

function previewCookie(cookie: string): string {
  return cookie.slice(0, 40) + (cookie.length > 40 ? "…" : "");
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const workspace = await getCurrentWorkspace(session.user.id);

  const connection = await prisma.platformConnection.findFirst({
    where: { workspaceId: workspace.id, platform: "pinterest" },
    select: {
      id: true,
      accountHandle: true,
      status: true,
      connectedAt: true,
      pinterestCookie: true,
    },
  });

  if (!connection) return NextResponse.json({ connection: null });

  return NextResponse.json({
    connection: {
      id: connection.id,
      accountHandle: connection.accountHandle,
      status: connection.status,
      connectedAt: connection.connectedAt,
      hasCookie: !!connection.pinterestCookie,
      cookiePreview: connection.pinterestCookie
        ? previewCookie(connection.pinterestCookie)
        : null,
    },
  });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const workspace = await getCurrentWorkspace(session.user.id);

  const body = await request.json();
  const parsed = connectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const handle = parsed.data.accountHandle.replace(/^@/, "");

  // One pinterest connection per workspace — augment whichever row exists
  // (OAuth may have created it already). Otherwise create a cookie-only row.
  const existing = await prisma.platformConnection.findFirst({
    where: { workspaceId: workspace.id, platform: "pinterest" },
  });

  const connection = existing
    ? await prisma.platformConnection.update({
        where: { id: existing.id },
        data: {
          pinterestCookie: parsed.data.pinterestCookie,
          // Don't downgrade an OAuth-active handle if cookie typed a different one
          ...(existing.accountHandle == null && { accountHandle: handle }),
          status: "active",
        },
        select: { id: true, accountHandle: true },
      })
    : await prisma.platformConnection.create({
        data: {
          userId: session.user.id,
          workspaceId: workspace.id,
          platform: "pinterest",
          accessToken: "", // cookie-only auth; OAuth token left blank
          pinterestCookie: parsed.data.pinterestCookie,
          accountHandle: handle,
          accountId: handle,
        },
        select: { id: true, accountHandle: true },
      });

  return NextResponse.json({ connection });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const workspace = await getCurrentWorkspace(session.user.id);

  // Only clear the cookie; leave the OAuth side intact. If the row exists only
  // for the cookie path (no OAuth), this turns it into an empty row — that's
  // fine for now since loadActiveConnection gates on accessToken.
  const r = await prisma.platformConnection.updateMany({
    where: { workspaceId: workspace.id, platform: "pinterest" },
    data: { pinterestCookie: null },
  });
  return NextResponse.json({ updated: r.count });
}
