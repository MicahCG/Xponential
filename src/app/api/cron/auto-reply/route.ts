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

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Auto-reply cron error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cron job failed" },
      { status: 500 }
    );
  }
}
