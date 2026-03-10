import { NextRequest, NextResponse } from "next/server";
import { pollLinkedInAccounts } from "@/lib/auto-reply/linkedin-poller";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await pollLinkedInAccounts();
    console.log("[Cron/linkedin-auto-reply] Result:", result);
    if (result.errors.length > 0) {
      console.error("[Cron/linkedin-auto-reply] Errors:", result.errors);
    }
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[Cron/linkedin-auto-reply] Fatal error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cron job failed" },
      { status: 500 }
    );
  }
}
