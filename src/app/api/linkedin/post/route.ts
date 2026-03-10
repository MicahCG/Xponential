import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createLinkedInPost } from "@/lib/platform/linkedin-client";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const body = await request.json();
  const content = typeof body.content === "string" ? body.content.trim() : "";

  if (!content) {
    return NextResponse.json({ error: "Content is required" }, { status: 400 });
  }

  if (content.length > 3000) {
    return NextResponse.json(
      { error: "Content exceeds 3000 characters" },
      { status: 400 }
    );
  }

  const connection = await prisma.platformConnection.findUnique({
    where: { userId_platform: { userId, platform: "linkedin" } },
  });

  if (!connection || connection.status !== "active") {
    return NextResponse.json(
      { error: "LinkedIn account not connected. Connect it in Settings." },
      { status: 400 }
    );
  }

  const authorUrn = `urn:li:person:${connection.accountId}`;

  try {
    const result = await createLinkedInPost(
      connection.accessToken,
      authorUrn,
      content
    );

    await prisma.postHistory.create({
      data: {
        userId,
        platform: "linkedin",
        postType: "original",
        content,
        platformPostId: result.id,
      },
    });

    return NextResponse.json({ success: true, id: result.id });
  } catch (err) {
    console.error("[LinkedIn] Post failed:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to publish LinkedIn post",
      },
      { status: 500 }
    );
  }
}
