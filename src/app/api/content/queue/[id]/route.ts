import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateQueueItemSchema } from "@/lib/validators";

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
  const parsed = updateQueueItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const item = await prisma.contentQueue.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!item) {
    return NextResponse.json(
      { error: "Queue item not found" },
      { status: 404 }
    );
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.status) updateData.status = parsed.data.status;
  if (parsed.data.content) updateData.content = parsed.data.content;

  const updated = await prisma.contentQueue.update({
    where: { id },
    data: updateData,
  });

  return NextResponse.json(updated);
}
