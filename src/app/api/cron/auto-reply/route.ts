import { NextRequest, NextResponse } from "next/server";
import { pollWatchedAccounts } from "@/lib/auto-reply/poller";

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
    const result = await pollWatchedAccounts();

    console.log("[Cron/auto-reply] Result:", {
      accountsChecked: result.accountsChecked,
      newTweetsFound: result.newTweetsFound,
      repliesGenerated: result.repliesGenerated,
      repliesPosted: result.repliesPosted,
      errors: result.errors.length,
    });
    if (result.errors.length > 0) {
      console.error("[Cron/auto-reply] Errors:", result.errors);
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[Cron/auto-reply] Fatal error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cron job failed" },
      { status: 500 }
    );
  }
}
