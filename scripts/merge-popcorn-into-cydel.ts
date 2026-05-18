import { prisma } from "../src/lib/prisma";

/**
 * Merge the "popcorn" user's data into "giraudelc" (Cydel).
 *
 * After this runs:
 * - popcorn's X PlatformConnection lives under Cydel's user + workspace
 *   (so it shows up in the X account picker alongside @cydelmg)
 * - popcorn's watched accounts, auto-reply logs, post history, learnings,
 *   follower snapshots, etc. all re-parent to Cydel's user + workspace
 * - For unique-key collisions (e.g. both users watching the same handle,
 *   both having a ContentLearning row on the same date), Cydel's existing
 *   row wins and popcorn's data is either merged or dropped
 * - popcorn's PersonalityProfile is deactivated (Cydel keeps the primary)
 * - popcorn's user record is deleted (cascades workspace + membership)
 *
 * Run with --dry-run first:
 *   npx tsx scripts/merge-popcorn-into-cydel.ts --dry-run
 * Then live:
 *   npx tsx scripts/merge-popcorn-into-cydel.ts
 */

const SRC_USERNAME = "popcorn";
const DST_USERNAME = "giraudelc";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(dryRun ? "=== DRY RUN — no writes ===\n" : "=== LIVE RUN ===\n");

  const src = await prisma.user.findUnique({
    where: { username: SRC_USERNAME },
    include: { ownedWorkspaces: true },
  });
  const dst = await prisma.user.findUnique({
    where: { username: DST_USERNAME },
    include: { ownedWorkspaces: true },
  });

  if (!src) {
    console.error(`Source user '${SRC_USERNAME}' not found`);
    process.exit(1);
  }
  if (!dst) {
    console.error(`Destination user '${DST_USERNAME}' not found`);
    process.exit(1);
  }

  const srcWorkspace = src.ownedWorkspaces[0];
  const dstWorkspace = dst.ownedWorkspaces.find((w) => w.isDefault) ?? dst.ownedWorkspaces[0];

  if (!srcWorkspace) {
    console.error(`Source user has no workspace`);
    process.exit(1);
  }
  if (!dstWorkspace) {
    console.error(`Destination user has no workspace`);
    process.exit(1);
  }

  console.log("SOURCE      :", src.username, src.id);
  console.log("            : workspace", srcWorkspace.name, srcWorkspace.id);
  console.log("DESTINATION :", dst.username, dst.id);
  console.log("            : workspace", dstWorkspace.name, dstWorkspace.id);
  console.log("");

  // ── 0. Inventory ───────────────────────────────────────────
  const inventory = {
    platformConnections: await prisma.platformConnection.count({ where: { userId: src.id } }),
    personalityProfiles: await prisma.personalityProfile.count({ where: { userId: src.id } }),
    postHistory: await prisma.postHistory.count({ where: { userId: src.id } }),
    contentQueue: await prisma.contentQueue.count({ where: { userId: src.id } }),
    watchedAccounts: await prisma.watchedAccount.count({ where: { userId: src.id } }),
    autoReplyLogs: await prisma.autoReplyLog.count({ where: { userId: src.id } }),
    contentLearnings: await prisma.contentLearning.count({ where: { userId: src.id } }),
    followerSnapshots: await prisma.followerSnapshot.count({ where: { userId: src.id } }),
    videoPosts: await prisma.videoPost.count({ where: { userId: src.id } }),
    pinterestApiLogs: await prisma.pinterestApiLog.count({ where: { userId: src.id } }),
    tiktokApiLogs: await prisma.tikTokApiLog.count({ where: { userId: src.id } }),
  };
  console.log("Source inventory:");
  for (const [k, v] of Object.entries(inventory)) console.log(`  ${k.padEnd(20)} ${v}`);
  console.log("");

  // ── 1. Platform connections (re-parent) ────────────────────
  const srcConns = await prisma.platformConnection.findMany({
    where: { userId: src.id },
    select: { id: true, platform: true, accountHandle: true, accountId: true },
  });
  console.log("Platform connections to migrate:");
  for (const c of srcConns) {
    console.log(`  - ${c.platform} @${c.accountHandle ?? "?"} (${c.accountId ?? "no id"})`);
    // Check collision with dst
    const collision = await prisma.platformConnection.findFirst({
      where: {
        workspaceId: dstWorkspace.id,
        platform: c.platform,
        accountId: c.accountId,
      },
    });
    if (collision) {
      console.log(`    ⚠ Cydel already has this exact account connected — will skip migration of this row`);
    }
  }
  console.log("");

  // ── 2. Watched accounts (handle dedupe) ────────────────────
  const srcWatched = await prisma.watchedAccount.findMany({
    where: { userId: src.id },
    select: { id: true, platform: true, accountHandle: true, isEnabled: true, replyCount: true },
  });
  let watchedToReparent = 0;
  let watchedToMerge = 0;
  const watchedRedirects: Array<{ from: string; to: string }> = [];
  for (const w of srcWatched) {
    const collision = await prisma.watchedAccount.findFirst({
      where: {
        workspaceId: dstWorkspace.id,
        platform: w.platform,
        accountHandle: w.accountHandle,
      },
      select: { id: true },
    });
    if (collision) {
      watchedToMerge += 1;
      watchedRedirects.push({ from: w.id, to: collision.id });
    } else {
      watchedToReparent += 1;
    }
  }
  console.log(`Watched accounts: ${watchedToReparent} to re-parent, ${watchedToMerge} collide with Cydel's existing (logs redirect to Cydel's row)`);
  console.log("");

  // ── 3. Content learnings (dedupe by date) ─────────────────
  const srcLearnings = await prisma.contentLearning.findMany({
    where: { userId: src.id },
    select: { id: true, platform: true, date: true },
  });
  let learningsToReparent = 0;
  let learningsToSkip = 0;
  const learningsToDelete: string[] = [];
  for (const l of srcLearnings) {
    const collision = await prisma.contentLearning.findFirst({
      where: {
        workspaceId: dstWorkspace.id,
        platform: l.platform,
        date: l.date,
      },
      select: { id: true },
    });
    if (collision) {
      learningsToSkip += 1;
      learningsToDelete.push(l.id);
    } else {
      learningsToReparent += 1;
    }
  }
  console.log(`Content learnings: ${learningsToReparent} to re-parent, ${learningsToSkip} duplicate dates (will drop popcorn's, keep Cydel's)`);
  console.log("");

  console.log("Summary of writes:");
  console.log(`  - Re-parent ~${inventory.postHistory + inventory.autoReplyLogs + inventory.followerSnapshots + inventory.contentQueue + inventory.videoPosts} unconstrained rows`);
  console.log(`  - Re-parent ${watchedToReparent} watched-accounts; merge ${watchedToMerge} into existing`);
  console.log(`  - Re-parent ${learningsToReparent} content-learnings; drop ${learningsToSkip} duplicates`);
  console.log(`  - Deactivate popcorn's PersonalityProfile (Cydel's stays active)`);
  console.log(`  - Migrate ${srcConns.length} PlatformConnection(s) onto Cydel's workspace`);
  console.log(`  - Delete popcorn user (cascades workspace, membership, sessions, oauth states)`);
  console.log("");

  if (dryRun) {
    console.log("✓ Dry-run complete. Re-run without --dry-run to execute.");
    await prisma.$disconnect();
    return;
  }

  // ── EXECUTE ────────────────────────────────────────────────
  console.log("Executing migration in a single transaction…");
  await prisma.$transaction(async (tx) => {
    // 2a. WatchedAccount: re-parent non-colliders; for colliders, redirect logs then delete
    for (const redirect of watchedRedirects) {
      await tx.autoReplyLog.updateMany({
        where: { watchedAccountId: redirect.from },
        data: { watchedAccountId: redirect.to },
      });
      await tx.watchedAccount.delete({ where: { id: redirect.from } });
    }
    await tx.watchedAccount.updateMany({
      where: { userId: src.id },
      data: { userId: dst.id, workspaceId: dstWorkspace.id },
    });

    // 3a. ContentLearning: drop duplicates, re-parent the rest
    if (learningsToDelete.length > 0) {
      await tx.contentLearning.deleteMany({ where: { id: { in: learningsToDelete } } });
    }
    await tx.contentLearning.updateMany({
      where: { userId: src.id },
      data: { userId: dst.id, workspaceId: dstWorkspace.id },
    });

    // Bulk re-parent (no unique constraints to worry about)
    await tx.autoReplyLog.updateMany({
      where: { userId: src.id },
      data: { userId: dst.id, workspaceId: dstWorkspace.id },
    });
    await tx.postHistory.updateMany({
      where: { userId: src.id },
      data: { userId: dst.id, workspaceId: dstWorkspace.id },
    });
    await tx.contentQueue.updateMany({
      where: { userId: src.id },
      data: { userId: dst.id, workspaceId: dstWorkspace.id },
    });
    await tx.followerSnapshot.updateMany({
      where: { userId: src.id },
      data: { userId: dst.id, workspaceId: dstWorkspace.id },
    });
    await tx.videoPost.updateMany({
      where: { userId: src.id },
      data: { userId: dst.id, workspaceId: dstWorkspace.id },
    });
    await tx.pinterestApiLog.updateMany({
      where: { userId: src.id },
      data: { userId: dst.id, workspaceId: dstWorkspace.id },
    });
    await tx.tikTokApiLog.updateMany({
      where: { userId: src.id },
      data: { userId: dst.id, workspaceId: dstWorkspace.id },
    });

    // PersonalityProfile: deactivate popcorn's (so Cydel's stays the primary active one), then re-parent
    await tx.personalityProfile.updateMany({
      where: { userId: src.id },
      data: { isActive: false },
    });
    await tx.personalityProfile.updateMany({
      where: { userId: src.id },
      data: { userId: dst.id, workspaceId: dstWorkspace.id },
    });

    // PlatformConnection: handle account-collision (very unlikely), then re-parent
    for (const c of srcConns) {
      const collision = await tx.platformConnection.findFirst({
        where: {
          workspaceId: dstWorkspace.id,
          platform: c.platform,
          accountId: c.accountId,
        },
      });
      if (collision) {
        // Same X account already in Cydel — drop popcorn's (logs already moved)
        await tx.platformConnection.delete({ where: { id: c.id } });
      } else {
        await tx.platformConnection.update({
          where: { id: c.id },
          data: { userId: dst.id, workspaceId: dstWorkspace.id },
        });
      }
    }

    // Finally: delete popcorn user. Cascade drops: ownedWorkspaces, memberships,
    // OAuthState, NextAuth Account/Session rows.
    await tx.user.delete({ where: { id: src.id } });
  });

  console.log("✓ Migration complete.");
  console.log("");

  // Verification
  const dstNow = {
    platformConnections: await prisma.platformConnection.count({ where: { userId: dst.id } }),
    watchedAccounts: await prisma.watchedAccount.count({ where: { userId: dst.id } }),
    autoReplyLogs: await prisma.autoReplyLog.count({ where: { userId: dst.id } }),
    postHistory: await prisma.postHistory.count({ where: { userId: dst.id } }),
    contentLearnings: await prisma.contentLearning.count({ where: { userId: dst.id } }),
    personalityProfiles: await prisma.personalityProfile.count({ where: { userId: dst.id } }),
  };
  console.log("Cydel inventory after merge:");
  for (const [k, v] of Object.entries(dstNow)) console.log(`  ${k.padEnd(20)} ${v}`);

  const popcornExists = await prisma.user.findUnique({ where: { username: SRC_USERNAME } });
  console.log("\npopcorn user still exists:", !!popcornExists);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
