import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connections = await prisma.platformConnection.findMany({
    where: { userId: session.user.id },
    select: {
      id: true,
      platform: true,
      accountHandle: true,
      connectedAt: true,
      status: true,
    },
  });

  return NextResponse.json(connections);
}
