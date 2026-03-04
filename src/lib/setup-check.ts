import { prisma } from "@/lib/prisma";

/**
 * Check if a user has completed the 3-step FTUE:
 * 1. Active X connection
 * 2. Active personality profile
 * 3. At least 1 enabled watched account
 */
export async function isSetupComplete(userId: string): Promise<boolean> {
  const [connection, profile, enabledAccounts] = await Promise.all([
    prisma.platformConnection.findFirst({
      where: { userId, platform: "x", status: "active" },
      select: { id: true },
    }),
    prisma.personalityProfile.findFirst({
      where: { userId, isActive: true },
      select: { id: true },
    }),
    prisma.watchedAccount.count({
      where: { userId, isEnabled: true },
    }),
  ]);

  return !!(connection && profile && enabledAccounts > 0);
}
