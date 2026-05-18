import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const conn = await prisma.platformConnection.findFirst({
    where: { id, userId: session.user.id, platform: "pinterest" },
    select: { id: true },
  });
  if (!conn) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  await prisma.platformConnection.update({
    where: { id: conn.id },
    data: {
      accessToken: "",
      refreshToken: null,
      tokenExpires: null,
    },
  });

  return NextResponse.json({ ok: true });
}
