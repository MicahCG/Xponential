export const APP_NAME = "Xponential";

export const PLATFORMS = ["x", "linkedin"] as const;
export type PlatformType = (typeof PLATFORMS)[number];

export const POST_TYPES = ["reply", "quote", "original"] as const;
export const BARRELS = ["barrel_1", "barrel_2", "original"] as const;
export const QUEUE_STATUSES = ["pending", "approved", "rejected", "posted"] as const;

export const X_CHAR_LIMIT = 280;
export const LINKEDIN_CHAR_LIMIT = 3000;

export const DEFAULT_GENERATION_COUNT = 3;
export const MAX_GENERATION_COUNT = 5;
export const MAX_CONTEXT_POSTS = 100;
export const AUTHOR_COOLDOWN_PER_DAY = 2;
export const THEME_RECYCLE_WINDOW_DAYS = 7;
