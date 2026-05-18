import { prisma } from "../src/lib/prisma";

/**
 * Backfill: every existing Workspace gets exactly one Membership row
 * making its owning User a member with role="owner". Idempotent.
 */
async function main() {
  const workspaces = await prisma.workspace.findMany({
    select: { id: true, userId: true, name: true },
  });
  console.log(`Found ${workspaces.length} workspaces`);

  let created = 0;
  let alreadyMember = 0;

  for (const w of workspaces) {
    const existing = await prisma.workspaceMembership.findUnique({
      where: { userId_workspaceId: { userId: w.userId, workspaceId: w.id } },
    });
    if (existing) {
      alreadyMember += 1;
      continue;
    }
    await prisma.workspaceMembership.create({
      data: { userId: w.userId, workspaceId: w.id, role: "owner" },
    });
    created += 1;
    console.log(`  created membership: ${w.name} (${w.id}) ← user ${w.userId}`);
  }

  console.log(`\n=== Summary ===`);
  console.log(`Memberships created: ${created}`);
  console.log(`Already members:     ${alreadyMember}`);
  console.log(`Total workspaces:    ${workspaces.length}`);

  const totalMemberships = await prisma.workspaceMembership.count();
  console.log(`Total memberships in DB: ${totalMemberships}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
