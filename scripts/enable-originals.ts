import { prisma } from "../src/lib/prisma";

async function main() {
  const username = process.argv[2] ?? "giraudelc";
  const mode = (process.argv[3] ?? "manual") as "manual" | "auto";

  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true },
  });
  if (!user) {
    console.error(`User '${username}' not found`);
    process.exit(1);
  }

  const conns = await prisma.platformConnection.findMany({
    where: { userId: user.id, platform: "x", status: "active" },
    select: {
      id: true,
      workspaceId: true,
      accountHandle: true,
      originalPostsEnabled: true,
      originalPostsMode: true,
      originalPostsPerDay: true,
      twitterCookie: true,
    },
  });

  if (conns.length === 0) {
    console.error(`No active X connections for @${username}`);
    process.exit(1);
  }

  for (const c of conns) {
    const cookieStatus = c.twitterCookie ? "✓ has cookie" : "✗ NO COOKIE (auto-post will fail)";
    console.log(
      `Found connection ${c.id} (@${c.accountHandle}) — was enabled=${c.originalPostsEnabled} mode=${c.originalPostsMode} perDay=${c.originalPostsPerDay} ${cookieStatus}`
    );
    const updated = await prisma.platformConnection.update({
      where: { id: c.id },
      data: {
        originalPostsEnabled: true,
        originalPostsMode: mode,
        originalPostsPerDay: 2,
      },
      select: {
        originalPostsEnabled: true,
        originalPostsMode: true,
        originalPostsPerDay: true,
      },
    });
    console.log(`  → enabled=${updated.originalPostsEnabled} mode=${updated.originalPostsMode} perDay=${updated.originalPostsPerDay}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
