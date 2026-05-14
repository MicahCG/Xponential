import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCurrentBrand } from "@/lib/brand-context";
import {
  loadActiveConnection,
  listBoards,
  PinterestApiError,
} from "@/lib/platform/pinterest-client";

/**
 * Board Access Test endpoint — calls GET /v5/boards via the API client (which
 * logs the request/response to PinterestApiLog) and returns a summary suitable
 * for the connected-dashboard "Test Board Access" button.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const brand = await getCurrentBrand(session.user.id);

  const conn = await loadActiveConnection(brand.id);
  if (!conn) {
    return NextResponse.json(
      { error: "Pinterest API is not connected for this brand." },
      { status: 400 }
    );
  }

  const startedAt = new Date();
  try {
    const all = await listBoards(conn);
    return NextResponse.json({
      ok: true,
      endpoint: "GET /v5/boards",
      statusCode: 200,
      ranAt: startedAt.toISOString(),
      totalBoards: all.length,
      sample: all.slice(0, 5).map((b) => ({
        id: b.id,
        name: b.name,
        privacy: b.privacy,
        pinCount: b.pin_count ?? null,
      })),
    });
  } catch (err) {
    if (err instanceof PinterestApiError) {
      return NextResponse.json(
        {
          error: err.message,
          endpoint: "GET /v5/boards",
          statusCode: err.httpCode,
          ranAt: startedAt.toISOString(),
        },
        { status: err.isAuthError ? 401 : 502 }
      );
    }
    return NextResponse.json(
      {
        error: "Failed to fetch boards.",
        endpoint: "GET /v5/boards",
        ranAt: startedAt.toISOString(),
      },
      { status: 500 }
    );
  }
}
