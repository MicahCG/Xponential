# Next Steps

_Last updated: 2026-05-14_

## Immediate (waiting on external)

- ⏳ **Wait for Pinterest Standard Access approval.** Submitted; nothing to do until reviewers respond. If they email questions, reply from `giraudelc@gmail.com` (the contact listed in the privacy policy).

## Work I can do now

- **Test publish behavior under Trial Access.** Trial Access can publish pins to your own connected account. Compose a real pin (eco-wedding example placeholders are loaded) and verify it appears on Pinterest + in `/pinterest/logs`.
- **Improve board dropdown / result display polish.**
  - Board dropdown shows raw names today — add board thumbnails or pin counts inline if reviewer feedback asks for it.
  - Publish-result card could show pin image preview alongside the metadata.
  - Long board names look fine but could wrap differently on narrow screens.
- **Polish the demo recording flow.** Walk-through once on prod, fix any rough edges before recording. Suggested run order in `PINTEREST_APPROVAL_STATUS.md`.

## After Standard Access lands

- Flip Pinterest publishing from gated-by-trial to production-default.
- Add real-account boards-list refresh (currently fetched per pin compose; could cache).
- Optional: invite second beta user to test multi-tenancy on Pinterest specifically.

## Later (deliberately deferred)

- **Pinterest queue / approval workflow.** Today every publish is one-click human-approved at compose time. A queue with separate approval step is nice-to-have, not needed for Trial→Standard transition.
- **Pinterest originals autopilot.** Analog to X originals — trending-driven pin suggestions on a schedule. Hold until queue+approval exists.
- **OpenClaw draft generation integration.** Pull OpenClaw-generated content into Xponential as draft pins/posts. Separate spike — design before build.
- **AI image generation for pins.** Currently URL paste only. Pick a non-Popcorn image generator (Flux / fal / Replicate) when ready.
- **Instagram + TikTok** platform worlds. Each gets its own dedicated route subtree and adapter per the platform-isolation principle. Pinterest is the template.

## Resume command — what to test next when you come back

```text
1. Open https://xponential-two.vercel.app — log in.
2. Confirm sidebar shows brand switcher (Cydel selected) and Pinterest nav item.
3. Go to /connections/pinterest → confirm:
   - Account Summary shows @ecoshopguide
   - Granted Permissions shows all 4 ✓ (user_accounts:read, boards:read,
     pins:read, pins:write).
   - Click "Run Board Access Test" → expect green Success card with board
     count, endpoint POST /api/pinterest/boards/test, ranAt timestamp,
     first 5 board names.
4. Click "Open Pin Composer".
5. Compose a test pin using the EcoShopGuide placeholders as a guide:
   - Paste a real public image URL.
   - Pick "Eco Wedding Aesthetics" (or any real board) from the dropdown.
   - Hit Publish pin → expect green result card with endpoint POST /v5/pins,
     status 200, pin ID, and an "Open on Pinterest" link.
6. Visit /pinterest/logs → confirm the POST /v5/pins call appears with
   expandable request + response JSON.
7. Visit /pinterest → confirm the new pin tile shows with the green "API" chip.

If anything fails: paste me the response JSON from /api/connect/debug/pinterest
and the error from /pinterest/logs and I'll diagnose.

If Pinterest has replied with questions or rejection notes, paste them in too
— priority becomes addressing their feedback before any other work above.
```
