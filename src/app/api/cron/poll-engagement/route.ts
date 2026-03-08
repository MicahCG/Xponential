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
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("poll-engagement cron error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cron job failed" },
      { status: 500 }
    );
  }
}
