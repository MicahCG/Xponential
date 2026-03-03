import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { scrapeSchema } from "@/lib/validators";
import { scrapeUserTweets } from "@/lib/personality/scraper";
import { analyzePersonality } from "@/lib/personality/analyzer";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = scrapeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const tweets = await scrapeUserTweets(
      session.user.id,
      parsed.data.tweetCount
    );

    if (tweets.length < 10) {
      return NextResponse.json(
        { error: "Not enough tweets found. At least 10 are needed for analysis." },
        { status: 400 }
      );
    }

    const profile = await analyzePersonality({
      method: "scrape",
      tweets,
    });

    // Deactivate existing profiles
    await prisma.personalityProfile.updateMany({
      where: { userId: session.user.id, isActive: true },
      data: { isActive: false },
    });

    const saved = await prisma.personalityProfile.create({
      data: {
        userId: session.user!.id,
        method: "scrape",
        rawInput: JSON.parse(JSON.stringify({ tweets })),
        profileData: JSON.parse(JSON.stringify(profile)),
      },
    });

    return NextResponse.json({
      id: saved.id,
      profile,
    });
  } catch (error) {
    console.error("Scrape personality error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to analyze personality",
      },
      { status: 500 }
    );
  }
}
