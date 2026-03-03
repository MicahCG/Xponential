import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { freetextSchema } from "@/lib/validators";
import { analyzePersonality } from "@/lib/personality/analyzer";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = freetextSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const profile = await analyzePersonality({
      method: "freetext",
      description: parsed.data.description,
      samplePosts: parsed.data.samplePosts,
    });

    await prisma.personalityProfile.updateMany({
      where: { userId: session.user.id, isActive: true },
      data: { isActive: false },
    });

    const saved = await prisma.personalityProfile.create({
      data: {
        userId: session.user!.id,
        method: "freetext",
        rawInput: JSON.parse(JSON.stringify(parsed.data)),
        profileData: JSON.parse(JSON.stringify(profile)),
      },
    });

    return NextResponse.json({
      id: saved.id,
      profile,
    });
  } catch (error) {
    console.error("Freetext personality error:", error);
    return NextResponse.json(
      { error: "Failed to analyze personality" },
      { status: 500 }
    );
  }
}
