import { NextRequest, NextResponse } from "next/server";
import { runDailyLearning } from "@/lib/learning/analyzer";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await runDailyLearning();

    console.log("[Cron/daily-learning] Result:", {
      usersProcessed: result.usersProcessed,
      learningsSaved: result.learningsSaved,
      errors: result.errors.length,
    });
    if (result.errors.length > 0) {
      console.error("[Cron/daily-learning] Errors:", result.errors);
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[Cron/daily-learning] Fatal error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cron job failed" },
      { status: 500 }
    );
  }
}
