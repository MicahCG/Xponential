import { prisma } from "../src/lib/prisma";

async function main() {
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

  console.log("=== brandId null counts ===");
  let totalNulls = 0;
  for (const table of tables) {
    // @ts-expect-error dynamic model access
    const nulls = await prisma[table].count({ where: { brandId: null } });
    // @ts-expect-error dynamic model access
    const total = await prisma[table].count();
    totalNulls += nulls;
    console.log(`  ${table.padEnd(22)} ${nulls.toString().padStart(6)} null / ${total} total`);
  }

  console.log("\n=== Brands per user ===");
  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      brands: { select: { id: true, name: true, isDefault: true } },
    },
  });
  for (const u of users) {
    const defaults = u.brands.filter((b) => b.isDefault).length;
    console.log(
      `  ${u.username.padEnd(20)} ${u.brands.length} brands (${defaults} default)`
    );
  }

  console.log(`\nTotal null brandIds: ${totalNulls}`);
  await prisma.$disconnect();
  if (totalNulls > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
