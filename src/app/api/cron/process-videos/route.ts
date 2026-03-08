import { NextRequest, NextResponse } from "next/server";
import { processVideoReplies } from "@/lib/auto-reply/video-processor";

/**
 * Cron endpoint that processes pending video reply logs.
 * Should run on a schedule (e.g. every 2-5 minutes) to pick up
 * video replies queued by the auto-reply poller.
 *
 * Can also be called manually to trigger processing.
 */
export async function GET(request: NextRequest) {
  // Verify cron secret in production
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await processVideoReplies();

    console.log("[Cron/process-videos] Result:", {
      kicked: result.kicked,
      ready: result.ready,
      posted: result.posted,
      failed: result.failed,
      stillProcessing: result.stillProcessing,
      errors: result.errors.length,
    });
    if (result.errors.length > 0) {
      console.error("[Cron/process-videos] Errors:", result.errors);
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[Cron/process-videos] Fatal error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Video processing failed",
      },
      { status: 500 }
    );
  }
}
