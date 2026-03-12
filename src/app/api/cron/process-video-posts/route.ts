import { NextRequest, NextResponse } from "next/server";
import { processVideoPosts } from "@/lib/video/video-post-processor";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await processVideoPosts();
    console.log("[Cron/process-video-posts] Result:", result);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[Cron/process-video-posts] Fatal error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
