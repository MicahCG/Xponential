import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();

  await prisma.watchedAccount.updateMany({
    where: { id, userId: session.user.id, platform: "linkedin" },
    data: {
      ...(body.isEnabled !== undefined && { isEnabled: body.isEnabled }),
      ...(body.replyMode !== undefined && { replyMode: body.replyMode }),
    },
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  await prisma.watchedAccount.deleteMany({
    where: { id, userId: session.user.id, platform: "linkedin" },
  });

  return NextResponse.json({ success: true });
}
