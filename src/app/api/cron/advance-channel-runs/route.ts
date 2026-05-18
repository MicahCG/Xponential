import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { advanceChannelRun } from "@/lib/channels/advance-run";

/**
 * Background poller for ChannelRuns. Without this, runs only advance while the
 * user has the page open — which means Popcorn renders that take 15-35 minutes
 * routinely fall through the cracks if the user navigates away. The cron runs
 * every 3 minutes, finds anything not in a terminal state, and pokes it.
 *
 * Authentication: in production Vercel sends `Authorization: Bearer CRON_SECRET`
 * for any path registered in `vercel.json` crons. In dev / manual invocation
 * the secret check is bypassed if CRON_SECRET isn't set.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const runs = await prisma.channelRun.findMany({
    where: { status: { in: ["pending", "generating", "ready", "posting"] } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: 50, // upper bound per tick — runs that miss this cycle pick up next tick
  });

  const results: Array<{ id: string; status: string; error?: string }> = [];
  for (const r of runs) {
    try {
      const advanced = await advanceChannelRun(r.id);
      if (advanced) {
        results.push({ id: r.id, status: advanced.run.status });
      }
    } catch (err) {
      // One bad run must not poison the batch — log + continue.
      const message = err instanceof Error ? err.message : "unknown error";
      console.error("[Cron/advance-channel-runs] Failed", r.id, message);
      results.push({ id: r.id, status: "error", error: message });
    }
  }

  console.log(
    `[Cron/advance-channel-runs] Processed ${results.length} non-terminal runs`
  );

  return NextResponse.json({
    success: true,
    processed: results.length,
    results,
  });
}
