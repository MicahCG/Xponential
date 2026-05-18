import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { connectionCookieName } from "@/lib/connection-context";

const VALID_PLATFORMS = ["x", "pinterest", "tiktok"] as const;
type ValidPlatform = (typeof VALID_PLATFORMS)[number];

const selectSchema = z.object({
  connectionId: z.string().min(1),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { platform } = await params;
  if (!VALID_PLATFORMS.includes(platform as ValidPlatform)) {
    return NextResponse.json(
      { error: "Unsupported platform" },
      { status: 400 }
    );
  }

  const body = await request.json();
  const parsed = selectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Verify the connection belongs to this user + platform
  const owned = await prisma.platformConnection.findFirst({
    where: {
      id: parsed.data.connectionId,
      userId: session.user.id,
      platform: platform as ValidPlatform,
    },
    select: { id: true, accountHandle: true },
  });
  if (!owned) {
    return NextResponse.json(
      { error: "Connection not found" },
      { status: 404 }
    );
  }

  const response = NextResponse.json({ connection: owned });
  response.cookies.set(
    connectionCookieName(platform as ValidPlatform),
    owned.id,
    {
      path: "/",
      httpOnly: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    }
  );
  return response;
}
