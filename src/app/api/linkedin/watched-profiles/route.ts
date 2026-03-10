import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MAX_ENABLED = 10;

function extractVanityFromUrl(input: string): string | null {
  // Accept full URLs like https://www.linkedin.com/in/satyanadella
  // or just the vanity name "satyanadella"
  const urlMatch = input.match(/linkedin\.com\/in\/([^/?#]+)/);
  if (urlMatch) return urlMatch[1].toLowerCase();
  // Plain vanity name (no slashes, no dots except linkedin.com)
  const plain = input.replace(/^@/, "").trim();
  if (/^[\w-]+$/.test(plain)) return plain.toLowerCase();
  return null;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profiles = await prisma.watchedAccount.findMany({
    where: { userId: session.user.id, platform: "linkedin" },
    orderBy: [{ isEnabled: "desc" }, { replyCount: "desc" }],
  });

  return NextResponse.json({ profiles });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const raw = (body.profileUrl as string | undefined)?.trim() ?? "";

  const vanity = extractVanityFromUrl(raw);
  if (!vanity) {
    return NextResponse.json(
      {
        error:
          "Enter a valid LinkedIn profile URL (e.g. linkedin.com/in/satyanadella) or vanity name",
      },
      { status: 400 }
    );
  }

  const profileUrl = `https://www.linkedin.com/in/${vanity}`;

  const existing = await prisma.watchedAccount.findUnique({
    where: {
      userId_platform_accountHandle: {
        userId: session.user.id,
        platform: "linkedin",
        accountHandle: profileUrl,
      },
    },
  });

  if (existing) {
    return NextResponse.json(
      { error: "This profile is already in your watch list" },
      { status: 400 }
    );
  }

  const enabledCount = await prisma.watchedAccount.count({
    where: { userId: session.user.id, platform: "linkedin", isEnabled: true },
  });

  const profile = await prisma.watchedAccount.create({
    data: {
      userId: session.user.id,
      platform: "linkedin",
      accountHandle: profileUrl,
      isEnabled: enabledCount < MAX_ENABLED,
      replyMode: "manual",
      replyType: "text",
      replyCount: 0,
    },
  });

  return NextResponse.json({ profile });
}
