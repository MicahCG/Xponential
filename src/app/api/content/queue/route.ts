import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get("status") as
    | "pending"
    | "approved"
    | "rejected"
    | "posted"
    | null;
  const platform = searchParams.get("platform") as "x" | "linkedin" | null;

  const where: Record<string, unknown> = { userId: session.user.id };
  if (status) where.status = status;
  if (platform) where.platform = platform;

  const items = await prisma.contentQueue.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json(items);
}
