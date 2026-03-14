import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { quizSchema } from "@/lib/validators";
import { analyzePersonality } from "@/lib/personality/analyzer";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = quizSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const profile = await analyzePersonality({
      method: "quiz",
      answers: parsed.data.answers,
    });

    const existing = await prisma.personalityProfile.findFirst({
      where: { userId: session.user.id, isActive: true },
      select: { replyInstructions: true, feedbackExamples: true },
    });

    await prisma.personalityProfile.updateMany({
      where: { userId: session.user.id, isActive: true },
      data: { isActive: false },
    });

    const saved = await prisma.personalityProfile.create({
      data: {
        userId: session.user!.id,
        method: "quiz",
        rawInput: JSON.parse(JSON.stringify(parsed.data)),
        profileData: JSON.parse(JSON.stringify(profile)),
        replyInstructions: existing?.replyInstructions ?? null,
        feedbackExamples: existing?.feedbackExamples ?? undefined,
      },
    });

    return NextResponse.json({
      id: saved.id,
      profile,
    });
  } catch (error) {
    console.error("Quiz personality error:", error);
    return NextResponse.json(
      { error: "Failed to analyze personality" },
      { status: 500 }
    );
  }
}
