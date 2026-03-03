import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const platform = searchParams.get("platform") as "x" | "linkedin" | null;
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 50);

  const where: Record<string, unknown> = { userId: session.user.id };
  if (platform) where.platform = platform;

  const [items, total] = await Promise.all([
    prisma.postHistory.findMany({
      where,
      orderBy: { postedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.postHistory.count({ where }),
  ]);

  return NextResponse.json({
    items,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}
