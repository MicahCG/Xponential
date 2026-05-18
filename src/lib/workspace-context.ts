import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const WORKSPACE_COOKIE_NAME = "xpo_workspace_id";

export type WorkspaceContext = {
  id: string;
  name: string;
  slug: string;
  isDefault: boolean;
};

async function loadWorkspaceForUser(
  workspaceId: string,
  userId: string
): Promise<WorkspaceContext | null> {
  // User must be a member of the workspace to access it. Today every user has
  // exactly one Membership (their own owner role); when invites land this
  // automatically extends to teammate access.
  const membership = await prisma.workspaceMembership.findFirst({
    where: { workspaceId, userId },
    include: {
      workspace: {
        select: { id: true, name: true, slug: true, isDefault: true },
      },
    },
  });
  return membership?.workspace ?? null;
}

async function loadDefaultWorkspace(userId: string): Promise<WorkspaceContext | null> {
  const ownedDefault = await prisma.workspaceMembership.findFirst({
    where: { userId, workspace: { isDefault: true } },
    orderBy: { workspace: { createdAt: "asc" } },
    include: {
      workspace: {
        select: { id: true, name: true, slug: true, isDefault: true },
      },
    },
  });
  if (ownedDefault) return ownedDefault.workspace;

  const anyMembership = await prisma.workspaceMembership.findFirst({
    where: { userId },
    orderBy: { workspace: { createdAt: "asc" } },
    include: {
      workspace: {
        select: { id: true, name: true, slug: true, isDefault: true },
      },
    },
  });
  return anyMembership?.workspace ?? null;
}

/**
 * Returns the currently-selected workspace for a user. Reads from cookie if
 * present and the user has membership; otherwise falls back to their default
 * workspace. Throws if the user has no workspace memberships at all.
 */
export async function getCurrentWorkspace(userId: string): Promise<WorkspaceContext> {
  const cookieStore = await cookies();
  const cookieWorkspaceId = cookieStore.get(WORKSPACE_COOKIE_NAME)?.value;

  if (cookieWorkspaceId) {
    const owned = await loadWorkspaceForUser(cookieWorkspaceId, userId);
    if (owned) return owned;
  }

  const fallback = await loadDefaultWorkspace(userId);
  if (fallback) return fallback;

  throw new Error(
    `No workspace membership found for user ${userId}. Run scripts/backfill-workspace-memberships.ts.`
  );
}

/**
 * Server-side workspace resolver for contexts without cookies (cron jobs,
 * background workers). Returns the user's default workspace.
 */
export async function getDefaultWorkspaceForUser(userId: string): Promise<WorkspaceContext> {
  const workspace = await loadDefaultWorkspace(userId);
  if (!workspace) {
    throw new Error(
      `No workspace membership found for user ${userId}. Run scripts/backfill-workspace-memberships.ts.`
    );
  }
  return workspace;
}

/**
 * Returns every workspace the user is a member of, default first.
 * UI hides this today (single workspace per user), but it's the right hook
 * for a future workspace switcher.
 */
export async function listWorkspacesForUser(userId: string) {
  const memberships = await prisma.workspaceMembership.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: {
      workspace: {
        select: {
          id: true,
          name: true,
          slug: true,
          avatarUrl: true,
          isDefault: true,
          createdAt: true,
        },
      },
    },
  });
  return memberships
    .map((m) => ({ ...m.workspace, role: m.role }))
    .sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
}

/**
 * Returns the set of workspace IDs the user can access. Use this when scoping
 * queries that read across all of a user's workspaces (e.g. "all my pins").
 */
export async function getAccessibleWorkspaceIds(userId: string): Promise<string[]> {
  const memberships = await prisma.workspaceMembership.findMany({
    where: { userId },
    select: { workspaceId: true },
  });
  return memberships.map((m) => m.workspaceId);
}
