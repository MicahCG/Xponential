import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const BRAND_COOKIE_NAME = "xpo_brand_id";

export type BrandContext = {
  id: string;
  name: string;
  slug: string;
  isDefault: boolean;
};

async function loadBrand(brandId: string, userId: string): Promise<BrandContext | null> {
  const brand = await prisma.brand.findFirst({
    where: { id: brandId, userId },
    select: { id: true, name: true, slug: true, isDefault: true },
  });
  return brand;
}

async function loadDefaultBrand(userId: string): Promise<BrandContext | null> {
  const brand = await prisma.brand.findFirst({
    where: { userId, isDefault: true },
    select: { id: true, name: true, slug: true, isDefault: true },
    orderBy: { createdAt: "asc" },
  });
  if (brand) return brand;
  return prisma.brand.findFirst({
    where: { userId },
    select: { id: true, name: true, slug: true, isDefault: true },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Returns the currently-selected brand for a logged-in user.
 * Reads from cookie if present and owned; otherwise falls back to the user's default brand.
 * Throws if the user has no brands (run scripts/backfill-brands.ts).
 */
export async function getCurrentBrand(userId: string): Promise<BrandContext> {
  const cookieStore = await cookies();
  const cookieBrandId = cookieStore.get(BRAND_COOKIE_NAME)?.value;

  if (cookieBrandId) {
    const owned = await loadBrand(cookieBrandId, userId);
    if (owned) return owned;
  }

  const fallback = await loadDefaultBrand(userId);
  if (fallback) return fallback;

  throw new Error(`No brand found for user ${userId}. Run scripts/backfill-brands.ts.`);
}

/**
 * Server-side brand resolver for contexts without cookies (cron jobs, background workers).
 * Returns the user's default brand. Use this when you need a brandId for a user
 * but you're not in a request handler with cookie access.
 */
export async function getDefaultBrandForUser(userId: string): Promise<BrandContext> {
  const brand = await loadDefaultBrand(userId);
  if (!brand) {
    throw new Error(`No brand found for user ${userId}. Run scripts/backfill-brands.ts.`);
  }
  return brand;
}

export async function listBrandsForUser(userId: string) {
  return prisma.brand.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: { id: true, name: true, slug: true, avatarUrl: true, isDefault: true, createdAt: true },
  });
}
