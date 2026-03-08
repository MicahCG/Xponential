import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MAX_ENABLED_ACCOUNTS = 12;

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

  // Find the account and verify ownership
  const account = await prisma.watchedAccount.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  // If enabling, check 5-account limit
  if (body.isEnabled === true && !account.isEnabled) {
    const enabledCount = await prisma.watchedAccount.count({
      where: { userId: session.user.id, isEnabled: true },
    });
    if (enabledCount >= MAX_ENABLED_ACCOUNTS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_ENABLED_ACCOUNTS} enabled accounts allowed` },
        { status: 400 }
      );
    }
  }

  const updateData: Record<string, unknown> = {};
  if (typeof body.isEnabled === "boolean") updateData.isEnabled = body.isEnabled;
  if (body.replyMode === "auto" || body.replyMode === "manual") {
    updateData.replyMode = body.replyMode;
  }
  if (body.replyType === "text" || body.replyType === "video") {
    updateData.replyType = body.replyType;
  }

  const updated = await prisma.watchedAccount.update({
    where: { id },
    data: updateData,
  });

  return NextResponse.json({ account: updated });
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

  // Verify ownership before deleting
  const account = await prisma.watchedAccount.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  await prisma.watchedAccount.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
