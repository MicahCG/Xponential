import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as xOAuth from "@/lib/oauth/x";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { platform } = await params;

  if (platform !== "x") {
    return NextResponse.json(
      { error: "Unsupported platform" },
      { status: 400 }
    );
  }

  const connection = await prisma.platformConnection.findUnique({
    where: {
      userId_platform: {
        userId: session.user.id,
        platform,
      },
    },
  });

  if (!connection) {
    return NextResponse.json(
      { error: "Connection not found" },
      { status: 404 }
    );
  }

  // Attempt to revoke the token (best effort)
  if (platform === "x") {
    try {
      await xOAuth.revokeToken({
        token: connection.accessToken,
        clientId: process.env.X_CLIENT_ID!,
        clientSecret: process.env.X_CLIENT_SECRET!,
      });
    } catch {
      // Token revocation is best-effort
    }
  }

  await prisma.platformConnection.delete({
    where: { id: connection.id },
  });

  return NextResponse.json({ success: true });
}
