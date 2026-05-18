import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { advanceChannelRun } from "@/lib/channels/advance-run";

/**
 * GET = poll-and-advance for a ChannelRun, from the browser. Shares its core
 * state machine with the background cron (`/api/cron/advance-channel-runs`),
 * so runs make progress whether or not the user has the page open.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: channelId, runId } = await params;

  // Verify ownership before letting the advance helper touch the row.
  const owns = await prisma.channelRun.findFirst({
    where: { id: runId, channelId, userId: session.user.id },
    select: { id: true },
  });
  if (!owns) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const result = await advanceChannelRun(runId);
  if (!result) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  return NextResponse.json(result);
}
