import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentBrand } from "@/lib/brand-context";
import {
  loadActiveConnection,
  initDraftUpload,
  TikTokApiError,
} from "@/lib/platform/tiktok-client";

const draftSchema = z.object({
  videoUrl: z.string().url().max(2000),
  caption: z.string().trim().max(2200).default(""),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const brand = await getCurrentBrand(session.user.id);

  const body = await request.json();
  const parsed = draftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  if (!/^https:\/\//i.test(parsed.data.videoUrl)) {
    return NextResponse.json(
      { error: "TikTok requires the video URL to use HTTPS." },
      { status: 400 }
    );
  }

  const conn = await loadActiveConnection(brand.id, { userId: session.user.id });
  if (!conn) {
    return NextResponse.json(
      { error: "TikTok is not connected for this brand. Connect Login Kit first." },
      { status: 400 }
    );
  }

  try {
    const result = await initDraftUpload(conn, {
      videoUrl: parsed.data.videoUrl,
    });

    const record = await prisma.postHistory.create({
      data: {
        userId: session.user.id,
        brandId: brand.id,
        platform: "tiktok",
        postType: "original",
        content: parsed.data.caption,
        videoUrl: parsed.data.videoUrl,
        videoFormat: "mp4",
        platformPostId: result.publishId,
        postingMethod: "tiktok_api",
      },
      select: { id: true },
    });

    return NextResponse.json({
      ok: true,
      publishId: result.publishId,
      historyId: record.id,
      endpoint: "POST /v2/post/publish/inbox/video/init/",
      statusCode: 200,
      message:
        "Draft sent to your TikTok inbox. Open the TikTok app to review and publish.",
    });
  } catch (err) {
    if (err instanceof TikTokApiError) {
      return NextResponse.json(
        {
          error: err.message,
          endpoint: "POST /v2/post/publish/inbox/video/init/",
          statusCode: err.httpCode,
          responseBody: err.responseBody,
        },
        { status: err.isAuthError ? 401 : 502 }
      );
    }
    console.error("[tiktok/draft] unexpected error:", err);
    return NextResponse.json(
      {
        error: "Unexpected error sending TikTok draft.",
        endpoint: "POST /v2/post/publish/inbox/video/init/",
      },
      { status: 500 }
    );
  }
}
