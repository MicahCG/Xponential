import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { publishContentSchema } from "@/lib/validators";
import { publishQueueItem } from "@/lib/content/publisher";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = publishContentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const result = await publishQueueItem(
      parsed.data.queueItemId,
      session.user.id
    );

    return NextResponse.json({
      success: true,
      platformPostId: result.platformPostId,
      platform: result.platform,
    });
  } catch (error) {
    console.error("Publish error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to publish content",
      },
      { status: 500 }
    );
  }
}
