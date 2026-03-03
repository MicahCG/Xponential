import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateContentSchema } from "@/lib/validators";
import { generateContent } from "@/lib/content/generator";

export async function POST(request: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = generateContentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const results = await generateContent(parsed.data, userId);

    // Add all generated options to the content queue
    const queueItems = await Promise.all(
      results.map((item) =>
        prisma.contentQueue.create({
          data: {
            userId,
            platform: item.platform,
            postType: item.postType,
            barrel: "original",
            content: item.content,
            targetPostId: parsed.data.targetPostUrl ?? null,
            targetAuthor: parsed.data.targetAuthor ?? null,
          },
        })
      )
    );

    return NextResponse.json({
      generated: results,
      queueItems: queueItems.map((q) => ({
        id: q.id,
        content: q.content,
        status: q.status,
      })),
    });
  } catch (error) {
    console.error("Content generation error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate content",
      },
      { status: 500 }
    );
  }
}
