import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accounts = await prisma.watchedAccount.findMany({
    where: { userId: session.user.id },
    orderBy: [{ isRecommended: "asc" }, { replyCount: "desc" }],
  });

  return NextResponse.json({ accounts });
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  // Expect: { accounts: [{ id: string, isEnabled: boolean }] }
  if (!body.accounts || !Array.isArray(body.accounts)) {
    return NextResponse.json(
      { error: "Invalid request body. Expected { accounts: [{ id, isEnabled }] }" },
      { status: 400 }
    );
  }

  try {
    // Update each account's enabled status
    for (const update of body.accounts as {
      id: string;
      isEnabled: boolean;
    }[]) {
      await prisma.watchedAccount.updateMany({
        where: {
          id: update.id,
          userId: session.user.id, // ensure user owns this account
        },
        data: { isEnabled: update.isEnabled },
      });
    }

    // Return updated list
    const accounts = await prisma.watchedAccount.findMany({
      where: { userId: session.user.id },
      orderBy: [{ isRecommended: "asc" }, { replyCount: "desc" }],
    });

    return NextResponse.json({ accounts });
  } catch (error) {
    console.error("Update watched accounts error:", error);
    return NextResponse.json(
      { error: "Failed to update watched accounts" },
      { status: 500 }
    );
  }
}
