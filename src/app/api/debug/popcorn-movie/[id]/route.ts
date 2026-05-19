import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getMovie, normalizeStatus } from "@/lib/popcorn/client";

/**
 * Diagnostic endpoint: calls Popcorn's get_movie from inside our Vercel
 * runtime and returns what we see. Lets us instantly compare what
 * Xponential's MCP client extracts vs. what direct MCP calls (e.g. in
 * Cursor) return for the same movie id. Auth-gated to the signed-in user.
 *
 * Usage: GET /api/debug/popcorn-movie/<popcorn-movie-uuid>
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  try {
    const movie = await getMovie(id);
    return NextResponse.json({
      ok: true,
      movieId: id,
      parsedStatus: movie.status,
      normalizedStatus: normalizeStatus(movie.status),
      videoUrl: movie.videoUrl,
      errorMessage: movie.errorMessage,
      raw: movie.raw,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        movieId: id,
        error: err instanceof Error ? err.message : "unknown error",
        errorClass:
          err instanceof Error ? err.constructor.name : typeof err,
      },
      { status: 502 }
    );
  }
}
