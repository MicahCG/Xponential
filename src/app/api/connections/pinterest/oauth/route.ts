import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspace-context";

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const workspace = await getCurrentWorkspace(session.user.id);

  // Clear OAuth tokens but keep the row alive so the cookie fallback (if any)
  // still works. loadActiveConnection in pinterest-client gates on accessToken
  // being non-empty, so emptying it disables the API path cleanly.
  const updated = await prisma.platformConnection.updateMany({
    where: { workspaceId: workspace.id, platform: "pinterest" },
    data: {
      accessToken: "",
      refreshToken: null,
      tokenExpires: null,
    },
  });

  return NextResponse.json({ updated: updated.count });
}
