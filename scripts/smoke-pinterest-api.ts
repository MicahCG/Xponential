/**
 * Smoke test for the Pinterest v5 API client.
 *
 * Uses a direct access token (e.g. the trial-access token issued in the
 * Pinterest Developer Portal) — bypasses OAuth so we can confirm the API path
 * works end-to-end before wiring up env vars and the full OAuth flow.
 *
 * Usage:
 *   PINTEREST_TEST_TOKEN=pina_xxx... npx tsx scripts/smoke-pinterest-api.ts
 *
 * It will:
 *   1. GET /v5/user_account
 *   2. GET /v5/boards   (lists boards on your account)
 *   3. Print a sample payload that /v5/pins WOULD receive (no actual pin posted)
 */

const API_BASE = "https://api.pinterest.com/v5";

async function api<T>(token: string, method: "GET" | "POST", endpoint: string, body?: unknown): Promise<{
  status: number;
  parsed: T | null;
  raw: string;
}> {
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };
  if (body !== undefined) init.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${endpoint}`, init);
  const raw = await res.text();
  let parsed: T | null = null;
  try {
    parsed = raw ? (JSON.parse(raw) as T) : null;
  } catch {
    /* keep raw */
  }
  return { status: res.status, parsed, raw };
}

async function main() {
  const token = process.env.PINTEREST_TEST_TOKEN;
  if (!token) {
    console.error(
      "Set PINTEREST_TEST_TOKEN to the pina_… access token from the Pinterest developer portal and re-run."
    );
    process.exit(1);
  }

  console.log("=== 1. GET /v5/user_account ===");
  const account = await api<{
    username: string;
    account_type: string;
    profile_image: string;
    website_url: string | null;
  }>(token, "GET", "/user_account");
  console.log(`  status: ${account.status}`);
  if (account.status === 200 && account.parsed) {
    console.log(`  username: @${account.parsed.username}`);
    console.log(`  account_type: ${account.parsed.account_type}`);
    console.log(`  profile_image: ${account.parsed.profile_image}`);
  } else {
    console.log("  raw:", account.raw.slice(0, 400));
    console.log(
      "\n  ✗ user_account failed — likely an expired/invalid token, or wrong scope. Fix this before continuing."
    );
    process.exit(1);
  }

  console.log("\n=== 2. GET /v5/boards?page_size=10 ===");
  const boards = await api<{
    items: Array<{ id: string; name: string; privacy: string; pin_count?: number }>;
    bookmark?: string | null;
  }>(token, "GET", "/boards?page_size=10");
  console.log(`  status: ${boards.status}`);
  if (boards.status === 200 && boards.parsed) {
    console.log(`  boards returned: ${boards.parsed.items.length}`);
    for (const b of boards.parsed.items.slice(0, 10)) {
      console.log(
        `    - ${b.id}  ${b.name}  (${b.privacy}${b.pin_count != null ? `, ${b.pin_count} pins` : ""})`
      );
    }
    if (boards.parsed.items.length === 0) {
      console.log(
        "  ⚠ No boards found. Create a board on Pinterest before composing a pin."
      );
    }
  } else {
    console.log("  raw:", boards.raw.slice(0, 400));
  }

  console.log("\n=== 3. Dry-run /v5/pins payload (NOT sent) ===");
  const firstBoard = boards.parsed?.items[0];
  const payload = {
    board_id: firstBoard?.id ?? "<your-board-id>",
    title: "Smoke test pin (not actually sent)",
    description: "A description that would be sent with the pin",
    link: "https://example.com/destination",
    alt_text: "Alt text for accessibility",
    media_source: {
      source_type: "image_url",
      url: "https://example.com/image.jpg",
    },
  };
  console.log(JSON.stringify(payload, null, 2));

  console.log(
    "\n✓ API client smoke test complete. If you saw your username + at least one board, the Pinterest API path is good to go."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
