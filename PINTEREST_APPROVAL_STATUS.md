# Pinterest Approval Status

_Last updated: 2026-05-14_

## Status snapshot

- **Pinterest OAuth:** ✅ Working end-to-end against the official v5 API
- **Xponential Pinterest app:** Submitted for Standard Access review
- **Current access tier:** Trial Access active · Standard Access pending Pinterest review
- **Connected account:** `@ecoshopguide` connected to brand `Cydel`, token refresh wired up
- **Granted scopes:** `user_accounts:read`, `boards:read`, `pins:read`, `pins:write`

## Approval-facing surfaces (what reviewers see)

| Page | URL | What it shows |
|---|---|---|
| Privacy Policy | `/privacy` | Pinterest-specific data handling, scope-by-scope explanation, disconnect path, contact `giraudelc@gmail.com` |
| Connection dashboard | `/connections/pinterest` | Account summary, Trial Access notice, Granted Permissions, Board Access Test, Recent API Activity, Safety Controls |
| Pin Composer | `/pinterest/compose` | Image URL, title, description, board dropdown (live from `GET /v5/boards`), destination URL, alt text, Safety Guarantees panel, publish-result card with endpoint/status/timestamp |
| Pin History | `/pinterest` | Grid of API-published pins with green "API" chip on each |
| API Logs | `/pinterest/logs` | Full audit trail of every `/v5/*` call with expandable request/response JSON |

## Pinterest dev portal config

- App ID: `1525270`
- Privacy Policy URL: `https://xponential-two.vercel.app/privacy`
- Redirect URI registered: `https://xponential-two.vercel.app/api/connect/callback/pinterest`
- Env vars set on Vercel (production): `PINTEREST_CLIENT_ID`, `PINTEREST_CLIENT_SECRET`, `PINTEREST_CALLBACK_URL`

## Architectural commitments documented in the privacy policy

- Single pin per publish action — no bulk, no scheduled auto-publishing
- Every API call logged for audit (`/pinterest/logs`)
- Pinterest content never sold, licensed, or shared with other Xponential users
- Disconnect button clears OAuth tokens immediately; full data deletion within 30 days on request
- Cookie/Apify fallback exists in source as developer tooling only; never surfaced in the reviewer-facing UI

## Internal-only artifacts (not shown to reviewers)

- `src/components/connections/pinterest-connect-form.tsx` (cookie form, dead-imported)
- `src/lib/platform/pinterest-poster.ts` (Apify adapter)
- `POST /api/connections/pinterest` cookie endpoint
- `method: "fallback"` branch in `POST /api/pinterest/pin`

If anyone re-surfaces cookie-fallback UI, it must be feature-flagged and never visible during a Pinterest review.
