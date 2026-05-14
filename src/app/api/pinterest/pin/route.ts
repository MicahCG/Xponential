import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentBrand } from "@/lib/brand-context";
import { createPin, PinterestPostError } from "@/lib/platform/pinterest-poster";

const pinSchema = z.object({
  imageUrl: z.string().url().max(2000),
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).default(""),
  boardName: z.string().trim().max(100).optional(),
  boardUrl: z.string().url().max(500).optional(),
  destinationUrl: z.string().url().max(2000).optional(),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const brand = await getCurrentBrand(session.user.id);

  const body = await request.json();
  const parsed = pinSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  if (!parsed.data.boardName && !parsed.data.boardUrl) {
    return NextResponse.json(
      { error: "Either boardName or boardUrl is required." },
      { status: 400 }
    );
  }

  const connection = await prisma.platformConnection.findFirst({
    where: {
      brandId: brand.id,
      platform: "pinterest",
      status: "active",
    },
    select: { id: true },
  });
  if (!connection) {
    return NextResponse.json(
      { error: "Pinterest is not connected for this brand." },
      { status: 400 }
    );
  }

  try {
    const result = await createPin({
      brandId: brand.id,
      connectionId: connection.id,
      imageUrl: parsed.data.imageUrl,
      title: parsed.data.title,
      description: parsed.data.description,
      boardName: parsed.data.boardName,
      boardUrl: parsed.data.boardUrl,
      destinationUrl: parsed.data.destinationUrl,
    });

    const record = await prisma.postHistory.create({
      data: {
        userId: session.user.id,
        brandId: brand.id,
        platform: "pinterest",
        postType: "original",
        content: parsed.data.description,
        imageUrl: parsed.data.imageUrl,
        platformPostId: result.pinId,
      },
      select: { id: true },
    });

    return NextResponse.json({
      ok: true,
      pinId: result.pinId,
      pinUrl: result.pinUrl ?? null,
      historyId: record.id,
    });
  } catch (err) {
    if (err instanceof PinterestPostError) {
      return NextResponse.json(
        { error: err.message, isAuthError: err.isAuthError },
        { status: err.isAuthError ? 401 : 502 }
      );
    }
    console.error("[pinterest/pin] unexpected error:", err);
    return NextResponse.json(
      { error: "Unexpected error creating pin." },
      { status: 500 }
    );
  }
}
