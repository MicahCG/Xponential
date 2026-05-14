import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createBrandSchema } from "@/lib/validators";
import { listBrandsForUser } from "@/lib/brand-context";

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "brand"
  );
}

async function ensureUniqueSlug(userId: string, base: string): Promise<string> {
  let slug = base;
  let n = 1;
  while (true) {
    const clash = await prisma.brand.findUnique({
      where: { userId_slug: { userId, slug } },
    });
    if (!clash) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const brands = await listBrandsForUser(session.user.id);
  return NextResponse.json({ brands });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createBrandSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const slug = await ensureUniqueSlug(session.user.id, slugify(parsed.data.name));
  const brand = await prisma.brand.create({
    data: {
      userId: session.user.id,
      name: parsed.data.name,
      slug,
      avatarUrl: parsed.data.avatarUrl,
      isDefault: false,
    },
    select: { id: true, name: true, slug: true, avatarUrl: true, isDefault: true, createdAt: true },
  });

  return NextResponse.json({ brand }, { status: 201 });
}
