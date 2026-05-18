import { cookies } from "next/headers";
import type { Platform } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getDefaultBrandForUser } from "@/lib/brand-context";

export function connectionCookieName(platform: Platform): string {
  return `xpo_${platform}_connection_id`;
}

export interface ConnectionSummary {
  id: string;
  platform: Platform;
  accountHandle: string | null;
  accountId: string | null;
  status: string;
  tokenExpires: Date | null;
  hasAccessToken: boolean;
  connectedAt: Date;
}

export async function listConnectionsForPlatform(
  userId: string,
  platform: Platform
): Promise<ConnectionSummary[]> {
  // Default brand acts as the implicit container; we don't surface brands in UI
  // but every connection still lives under one. This works for users who only
  // have a single brand (every existing user).
  const rows = await prisma.platformConnection.findMany({
    where: { userId, platform },
    orderBy: [{ status: "asc" }, { connectedAt: "desc" }],
    select: {
      id: true,
      platform: true,
      accountHandle: true,
      accountId: true,
      status: true,
      tokenExpires: true,
      accessToken: true,
      connectedAt: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    platform: r.platform,
    accountHandle: r.accountHandle,
    accountId: r.accountId,
    status: r.status,
    tokenExpires: r.tokenExpires,
    hasAccessToken: !!r.accessToken,
    connectedAt: r.connectedAt,
  }));
}

/**
 * Resolves the connection the user has "selected" for this platform.
 * Reads the per-platform cookie; falls back to the first active connection.
 * Returns null if the user has no connection on that platform at all.
 */
export async function getCurrentConnection(
  userId: string,
  platform: Platform
): Promise<ConnectionSummary | null> {
  const cookieStore = await cookies();
  const cookieId = cookieStore.get(connectionCookieName(platform))?.value;

  if (cookieId) {
    const owned = await prisma.platformConnection.findFirst({
      where: { id: cookieId, userId, platform },
      select: {
        id: true,
        platform: true,
        accountHandle: true,
        accountId: true,
        status: true,
        tokenExpires: true,
        accessToken: true,
        connectedAt: true,
      },
    });
    if (owned) {
      return {
        id: owned.id,
        platform: owned.platform,
        accountHandle: owned.accountHandle,
        accountId: owned.accountId,
        status: owned.status,
        tokenExpires: owned.tokenExpires,
        hasAccessToken: !!owned.accessToken,
        connectedAt: owned.connectedAt,
      };
    }
  }

  // Fallback — prefer active connections, most recently connected first
  const fallback = await prisma.platformConnection.findFirst({
    where: { userId, platform, status: "active" },
    orderBy: { connectedAt: "desc" },
    select: {
      id: true,
      platform: true,
      accountHandle: true,
      accountId: true,
      status: true,
      tokenExpires: true,
      accessToken: true,
      connectedAt: true,
    },
  });
  if (!fallback) return null;
  return {
    id: fallback.id,
    platform: fallback.platform,
    accountHandle: fallback.accountHandle,
    accountId: fallback.accountId,
    status: fallback.status,
    tokenExpires: fallback.tokenExpires,
    hasAccessToken: !!fallback.accessToken,
    connectedAt: fallback.connectedAt,
  };
}

/**
 * Ensures the user has a brand to attach new connections to. Re-exports the
 * default-brand fetch under a connection-context-friendly name so callers
 * don't need to know brands exist.
 */
export async function getImplicitBrand(userId: string) {
  return getDefaultBrandForUser(userId);
}
