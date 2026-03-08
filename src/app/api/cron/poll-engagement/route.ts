import { NextRequest, NextResponse } from "next/server";
import { pollEngagement } from "@/lib/learning/engagement";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await pollEngagement();

    console.log("[Cron/poll-engagement] Result:", {
      usersProcessed: result.usersProcessed,
      postsUpdated: result.postsUpdated,
      errors: result.errors.length,
    });
    if (result.errors.length > 0) {
      console.error("[Cron/poll-engagement] Errors:", result.errors);
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[Cron/poll-engagement] Fatal error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cron job failed" },
      { status: 500 }
    );
  }
}
