import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateProfileSchema } from "@/lib/validators";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await prisma.personalityProfile.findFirst({
    where: { userId: session.user.id, isActive: true },
    select: {
      id: true,
      method: true,
      profileData: true,
      replyInstructions: true,
      feedbackExamples: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!profile) {
    return NextResponse.json(null);
  }

  return NextResponse.json(profile);
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const existing = await prisma.personalityProfile.findFirst({
    where: { userId: session.user.id, isActive: true },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "No active personality profile found" },
      { status: 404 }
    );
  }

  const { replyInstructions, feedbackExamples, ...profileUpdates } = parsed.data;
  const currentData = existing.profileData as Record<string, unknown>;
  const updatedData = { ...currentData, ...profileUpdates };

  const updated = await prisma.personalityProfile.update({
    where: { id: existing.id },
    data: {
      profileData: JSON.parse(JSON.stringify(updatedData)),
      ...(replyInstructions !== undefined && { replyInstructions }),
      ...(feedbackExamples !== undefined && { feedbackExamples: JSON.parse(JSON.stringify(feedbackExamples)) }),
    },
  });

  return NextResponse.json({
    id: updated.id,
    profile: updated.profileData,
    replyInstructions: updated.replyInstructions,
    feedbackExamples: updated.feedbackExamples,
  });
}
