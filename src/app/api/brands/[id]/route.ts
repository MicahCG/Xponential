import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateBrandSchema } from "@/lib/validators";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const parsed = updateBrandSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const brand = await prisma.brand.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }

  const updated = await prisma.brand.update({
    where: { id },
    data: {
      ...(parsed.data.name !== undefined && { name: parsed.data.name }),
      ...(parsed.data.avatarUrl !== undefined && { avatarUrl: parsed.data.avatarUrl }),
    },
    select: { id: true, name: true, slug: true, avatarUrl: true, isDefault: true },
  });

  return NextResponse.json({ brand: updated });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const brand = await prisma.brand.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }
  if (brand.isDefault) {
    return NextResponse.json(
      { error: "Cannot delete the default brand. Set another brand as default first." },
      { status: 400 }
    );
  }

  // Refuse if the brand still has content unless explicitly forced
  const force = request.nextUrl.searchParams.get("force") === "true";
  if (!force) {
    const [connections, posts, queue, watched, autoReplies, videos] = await Promise.all([
      prisma.platformConnection.count({ where: { brandId: id } }),
      prisma.postHistory.count({ where: { brandId: id } }),
      prisma.contentQueue.count({ where: { brandId: id } }),
      prisma.watchedAccount.count({ where: { brandId: id } }),
      prisma.autoReplyLog.count({ where: { brandId: id } }),
      prisma.videoPost.count({ where: { brandId: id } }),
    ]);
    const total = connections + posts + queue + watched + autoReplies + videos;
    if (total > 0) {
      return NextResponse.json(
        {
          error: "Brand has content — pass ?force=true to delete it and all attached data.",
          counts: { connections, posts, queue, watched, autoReplies, videos },
        },
        { status: 409 }
      );
    }
  }

  await prisma.brand.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
