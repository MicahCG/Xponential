import { prisma } from "../src/lib/prisma";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "brand";
}

async function ensureUniqueSlug(userId: string, base: string): Promise<string> {
  let slug = base;
  let n = 1;
  while (true) {
    const clash = await prisma.brand.findUnique({
      where: { userId_slug: { userId, slug } },
    });
    if (!clash) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(dryRun ? "DRY RUN — no writes" : "LIVE RUN — will write");

  const users = await prisma.user.findMany({
    select: { id: true, username: true, name: true },
  });
  console.log(`Found ${users.length} users`);

  let createdBrands = 0;
  const updateCounts: Record<string, number> = {};

  for (const user of users) {
    const existing = await prisma.brand.findFirst({
      where: { userId: user.id, isDefault: true },
    });

    let brandId: string;
    if (existing) {
      brandId = existing.id;
      console.log(`  user ${user.username}: default brand already exists (${brandId})`);
    } else {
      const displayName = user.name?.trim() || user.username;
      const baseSlug = slugify(user.username);
      const slug = dryRun ? baseSlug : await ensureUniqueSlug(user.id, baseSlug);

      if (dryRun) {
        console.log(`  user ${user.username}: would create brand "${displayName}" (slug=${slug})`);
        continue;
      }

      const brand = await prisma.brand.create({
        data: {
          userId: user.id,
          name: displayName,
          slug,
          isDefault: true,
        },
      });
      brandId = brand.id;
      createdBrands += 1;
      console.log(`  user ${user.username}: created brand "${displayName}" (${brandId})`);
    }

    const tables = [
      "platformConnection",
      "personalityProfile",
      "postHistory",
      "contentQueue",
      "watchedAccount",
      "autoReplyLog",
      "contentLearning",
      "followerSnapshot",
      "videoPost",
    ] as const;

    for (const table of tables) {
      // @ts-expect-error dynamic model access — all listed models have userId+brandId
      const result = await prisma[table].updateMany({
        where: { userId: user.id, brandId: null },
        data: { brandId },
      });
      if (result.count > 0) {
        updateCounts[table] = (updateCounts[table] ?? 0) + result.count;
        console.log(`    ${table}: backfilled ${result.count} rows`);
      }
    }
  }

  console.log("\n=== Summary ===");
  console.log(`Brands created: ${createdBrands}`);
  console.log(`Rows backfilled by table:`);
  for (const [table, count] of Object.entries(updateCounts)) {
    console.log(`  ${table}: ${count}`);
  }

  console.log("\n=== Verification (rows with NULL brandId) ===");
  const verifyTables = [
    "platformConnection",
    "personalityProfile",
    "postHistory",
    "contentQueue",
    "watchedAccount",
    "autoReplyLog",
    "contentLearning",
    "followerSnapshot",
    "videoPost",
  ] as const;
  for (const table of verifyTables) {
    // @ts-expect-error dynamic model access
    const remaining = await prisma[table].count({ where: { brandId: null } });
    console.log(`  ${table}: ${remaining} null`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
