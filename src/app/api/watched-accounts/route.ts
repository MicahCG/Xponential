import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getValidAccessToken } from "@/lib/platform/x-client";

const MAX_ENABLED_ACCOUNTS = 10;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accounts = await prisma.watchedAccount.findMany({
    where: { userId: session.user.id },
    orderBy: [{ isRecommended: "asc" }, { replyCount: "desc" }],
  });

  return NextResponse.json({ accounts });
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  // Expect: { accounts: [{ id: string, isEnabled: boolean }] }
  if (!body.accounts || !Array.isArray(body.accounts)) {
    return NextResponse.json(
      { error: "Invalid request body. Expected { accounts: [{ id, isEnabled }] }" },
      { status: 400 }
    );
  }

  try {
    // Update each account's enabled status
    for (const update of body.accounts as {
      id: string;
      isEnabled: boolean;
    }[]) {
      await prisma.watchedAccount.updateMany({
        where: {
          id: update.id,
          userId: session.user.id, // ensure user owns this account
        },
        data: { isEnabled: update.isEnabled },
      });
    }

    // Return updated list
    const accounts = await prisma.watchedAccount.findMany({
      where: { userId: session.user.id },
      orderBy: [{ isRecommended: "asc" }, { replyCount: "desc" }],
    });

    return NextResponse.json({ accounts });
  } catch (error) {
    console.error("Update watched accounts error:", error);
    return NextResponse.json(
      { error: "Failed to update watched accounts" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const handle = body.handle?.replace("@", "").trim();

  if (!handle) {
    return NextResponse.json(
      { error: "Account handle is required" },
      { status: 400 }
    );
  }

  try {
    // Check 5-account limit
    const enabledCount = await prisma.watchedAccount.count({
      where: { userId: session.user.id, isEnabled: true },
    });

    if (enabledCount >= MAX_ENABLED_ACCOUNTS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_ENABLED_ACCOUNTS} enabled accounts allowed. Disable one first.` },
        { status: 400 }
      );
    }

    // Check if already exists
    const existing = await prisma.watchedAccount.findUnique({
      where: {
        userId_platform_accountHandle: {
          userId: session.user.id,
          platform: "x",
          accountHandle: handle,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Account already in your watch list" },
        { status: 400 }
      );
    }

    // Validate the account exists on X by looking up the user
    let accountId: string | undefined;
    let followersCount: number | undefined;
    try {
      const accessToken = await getValidAccessToken(session.user.id);
      const { TwitterApi } = await import("twitter-api-v2");
      const client = new TwitterApi(accessToken);
      const user = await client.v2.userByUsername(handle, {
        "user.fields": ["public_metrics"],
      });
      if (!user.data) {
        return NextResponse.json(
          { error: `X account @${handle} not found` },
          { status: 404 }
        );
      }
      accountId = user.data.id;
      followersCount = user.data.public_metrics?.followers_count;
    } catch {
      return NextResponse.json(
        { error: `Could not verify @${handle} on X` },
        { status: 400 }
      );
    }

    const account = await prisma.watchedAccount.create({
      data: {
        userId: session.user.id,
        platform: "x",
        accountHandle: handle,
        accountId,
        followersCount: followersCount ?? null,
        isRecommended: false,
        isEnabled: true,
        replyCount: 0,
      },
    });

    return NextResponse.json({ account });
  } catch (error) {
    console.error("Add watched account error:", error);
    return NextResponse.json(
      { error: "Failed to add account" },
      { status: 500 }
    );
  }
}
