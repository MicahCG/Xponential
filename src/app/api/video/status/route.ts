import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getMovieStatus, getMovieUrl } from "@/lib/video/popcorn";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const movieRootId = request.nextUrl.searchParams.get("movieRootId");
  if (!movieRootId) {
    return NextResponse.json({ error: "movieRootId is required" }, { status: 400 });
  }

  try {
    const status = await getMovieStatus(movieRootId);

    if (status.status !== "ready") {
      return NextResponse.json({ status: "processing" });
    }

    // Fetch the final URL once ready
    const movieUrl = await getMovieUrl(movieRootId);
    const videoUrl = movieUrl.videoUrl ?? movieUrl.watermarkedVideoUrl;

    if (!videoUrl) {
      return NextResponse.json({ status: "processing" });
    }

    return NextResponse.json({ status: "ready", videoUrl });
  } catch (error) {
    console.error("[video/status] Popcorn error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to check status" },
      { status: 500 }
    );
  }
}
