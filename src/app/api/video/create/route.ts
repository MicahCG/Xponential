import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createMovie } from "@/lib/video/popcorn";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const prompt = (body.prompt as string)?.trim();

  if (!prompt) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { settings: true },
  });

  const settings = (user?.settings ?? {}) as Record<string, unknown>;
  const popcornUserId = settings.popcornUserId as string | undefined;

  if (!popcornUserId) {
    return NextResponse.json(
      { error: "Popcorn User ID not configured. Add it in Settings first." },
      { status: 400 }
    );
  }

  try {
    const movie = await createMovie({
      prompt,
      duration: "15",
      orientation: "vertical",
      quality: "medium",
      userId: popcornUserId,
    });

    return NextResponse.json({ movieRootId: movie.movieRootId });
  } catch (error) {
    console.error("[video/create] Popcorn error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create video" },
      { status: 500 }
    );
  }
}
