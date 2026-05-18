import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCurrentWorkspace } from "@/lib/workspace-context";
import {
  loadActiveConnection,
  listBoards,
  PinterestApiError,
} from "@/lib/platform/pinterest-client";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const workspace = await getCurrentWorkspace(session.user.id);

  const conn = await loadActiveConnection(workspace.id, { userId: session.user.id });
  if (!conn || !conn.accessToken) {
    return NextResponse.json({ boards: [], hasApiConnection: false });
  }

  try {
    const boards = await listBoards(conn);
    return NextResponse.json({
      hasApiConnection: true,
      boards: boards.map((b) => ({
        id: b.id,
        name: b.name,
        privacy: b.privacy,
        pinCount: b.pin_count ?? null,
      })),
    });
  } catch (err) {
    if (err instanceof PinterestApiError) {
      return NextResponse.json(
        { error: err.message, hasApiConnection: true, boards: [] },
        { status: err.isAuthError ? 401 : 502 }
      );
    }
    return NextResponse.json(
      { error: "Failed to fetch boards.", hasApiConnection: true, boards: [] },
      { status: 500 }
    );
  }
}
