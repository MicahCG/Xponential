# Xponential Social Publishing — Status

_Last updated: 2026-05-14_

## Platform state

Xponential is a brand-aware social publishing platform. One user can manage many brands; each brand carries its own connections, personality profile, queues, and history.

### Platforms

| Platform | Connect | Post | Auto-reply | Originals autopilot | Notes |
|---|---|---|---|---|---|
| **X / Twitter** | OAuth + cookie | Apify cookie actor | Live | Live (2×/day cron, opt-in per connection) | X API blocked for posting since Feb 2026; Apify cookie path is the production path |
| **Pinterest** | Official API (OAuth) | Pinterest v5 API | — | — | Trial Access active, Standard Access pending. Cookie/Apify path exists in source as dev-only fallback, hidden from UI |
| **Instagram** | not built | — | — | — | Roadmap |
| **TikTok** | not built | — | — | — | Roadmap |
| **LinkedIn** | removed | — | — | — | Deleted 2026-05-14 |

## Multi-brand foundation

- `Brand` model owns: connections, personality profiles, post history, content queue, watched accounts, auto-reply logs, content learnings, follower snapshots, video posts, Pinterest API logs
- All scoped tables enforce `brandId NOT NULL` with brand-scoped unique constraints
- Top-left **BrandSwitcher** in the sidebar rescopes the entire app context (dashboard, connections, queue, history, settings)
- `Connections` hub lists every platform's status per the active brand

## Pinterest-specific (see `PINTEREST_APPROVAL_STATUS.md` for detail)

- OAuth working, scopes `user_accounts:read`, `boards:read`, `pins:read`, `pins:write`
- Approval-facing UI: connection dashboard, pin composer, API logs, privacy policy
- Connected account: `@ecoshopguide` on brand `Cydel`
- Privacy Policy URL submitted: `https://xponential-two.vercel.app/privacy`

## X-specific

- Auto-replies: live cron polling watched accounts with per-account learning + quality gate
- Originals autopilot: opt-in, 10am + 6pm ET (`0 14,22 * * *`), uses Apify trending actor + brand personality + Haiku quality gate (threshold 70), manual or auto mode per connection
- Required Vercel env: `APIFY_API_TOKEN`, `APIFY_X_TRENDING_ACTOR` (`oCAEibQtPGKXcF5MM`)

## Key Vercel env vars currently configured

- Database: `DATABASE_URL`, `DIRECT_URL` (Supabase prod)
- Auth: NextAuth secrets
- X: `X_CLIENT_ID`, `X_CLIENT_SECRET`, `X_CALLBACK_URL`
- Pinterest: `PINTEREST_CLIENT_ID=1525270`, `PINTEREST_CLIENT_SECRET`, `PINTEREST_CALLBACK_URL`
- Apify: `APIFY_API_TOKEN`, `APIFY_X_TRENDING_ACTOR`
- AI: `ANTHROPIC_API_KEY`

## Production URL

`https://xponential-two.vercel.app`
