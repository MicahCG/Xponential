import { prisma } from "../src/lib/prisma";

async function main() {
  console.log("=== Checking for duplicate values that would block new unique constraints ===\n");

  // platform_connections: (brandId, platform, accountId)
  const conns = await prisma.$queryRaw<
    Array<{ brand_id: string; platform: string; account_id: string | null; count: bigint }>
  >`
    SELECT brand_id, platform, account_id, COUNT(*)::bigint AS count
    FROM platform_connections
    GROUP BY brand_id, platform, account_id
    HAVING COUNT(*) > 1
  `;
  console.log(`platform_connections duplicates: ${conns.length}`);
  conns.forEach((r) => console.log(`  ${r.brand_id} | ${r.platform} | ${r.account_id} → ${r.count}`));

  // watched_accounts: (brandId, platform, accountHandle)
  const watched = await prisma.$queryRaw<
    Array<{ brand_id: string; platform: string; account_handle: string; count: bigint }>
  >`
    SELECT brand_id, platform, account_handle, COUNT(*)::bigint AS count
    FROM watched_accounts
    GROUP BY brand_id, platform, account_handle
    HAVING COUNT(*) > 1
  `;
  console.log(`\nwatched_accounts duplicates: ${watched.length}`);
  watched.forEach((r) => console.log(`  ${r.brand_id} | ${r.platform} | ${r.account_handle} → ${r.count}`));

  // content_learnings: (brandId, platform, date)
  const learnings = await prisma.$queryRaw<
    Array<{ brand_id: string; platform: string; date: Date; count: bigint }>
  >`
    SELECT brand_id, platform, date, COUNT(*)::bigint AS count
    FROM content_learnings
    GROUP BY brand_id, platform, date
    HAVING COUNT(*) > 1
  `;
  console.log(`\ncontent_learnings duplicates: ${learnings.length}`);
  learnings.forEach((r) => console.log(`  ${r.brand_id} | ${r.platform} | ${r.date.toISOString()} → ${r.count}`));

  const total = conns.length + watched.length + learnings.length;
  console.log(`\n=== Total duplicates: ${total} ===`);
  await prisma.$disconnect();
  if (total > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
