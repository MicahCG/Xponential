# Popcorn Video API — Integration Guide

Popcorn is the AI video generation service used by Xponential to create short videos for auto-replies. It uses the **MCP (Movie Creation Protocol)** API.

---

## Environment Variables

These must be set in both `.env.local` (local dev) and in Vercel (production):

| Variable | Description |
|---|---|
| `POPCORN_API_URL` | Base URL of the Popcorn API server (e.g. `https://api.popcorn.ai`) |
| `MCP_API_KEY` | API key passed as `x-api-key` header on every request |

Additionally, each **user** must have a `popcornUserId` stored in their `user.settings` JSON column in the database. This is set via the app's Settings page and saved via `PUT /api/settings/popcorn`.

---

## Authentication

Every request requires:
```
x-api-key: <MCP_API_KEY>
Content-Type: application/json   (for POST requests)
```

---

## Complete Video Generation Flow

Video generation is **asynchronous**. You kick off a job, then poll until it's ready.

```
createMovie()  →  poll getMovieStatus()  →  getMovieUrl()  →  triggerWatermarkedVideo()  →  poll for watermarkedVideoUrl
```

### Step 1 — Create a Movie

**Endpoint:** `POST {POPCORN_API_URL}/api/mcp/createMovie`

**Request body:**
```json
{
  "prompt": "Create a video based off this tweet https://x.com/username/status/12345",
  "duration": "15",
  "orientation": "vertical",
  "style": "muppet",
  "quality": "budget",
  "userId": "<popcornUserId>"
}
```

**Field options:**
| Field | Type | Options | Notes |
|---|---|---|---|
| `prompt` | string | any text | Describe the video content. Tweet URLs work well. |
| `duration` | string | `"15"` `"30"` `"45"` `"60"` | Duration in seconds |
| `orientation` | string | `"vertical"` `"horizontal"` | Vertical = 9:16 portrait (best for mobile/Twitter) |
| `style` | string | `"muppet"` `"cinematic"` + others | Visual style of the video |
| `quality` | string | `"budget"` `"low"` `"medium"` `"high"` `"premium"` `"professional"` | Higher quality = longer generation time + more cost |
| `userId` | string | user's Popcorn account ID | Required — links job to Popcorn account |

**Response:**
```json
{
  "conversationId": "abc123",
  "movieRootId": "xyz789"
}
```

Save `movieRootId` — you'll use it to poll status and fetch the final URL.

---

### Step 2 — Poll for Status

**Endpoint:** `GET {POPCORN_API_URL}/api/mcp/getMovieStatus?movieRootId=<id>`

Poll every 30–60 seconds. Typical generation time: **5–15 minutes**.

**Response:**
```json
{
  "found": true,
  "movieRootId": "xyz789",
  "movieId": "def456",
  "status": "processing",
  "title": "Generated Title",
  "videoUrl": null,
  "thumbnailUrl": null
}
```

When `status` becomes `"ready"`, proceed to Step 3.

**Timeout:** If still `"processing"` after **30 minutes**, mark as failed.

---

### Step 3 — Get Movie URL

**Endpoint:** `GET {POPCORN_API_URL}/api/mcp/getMovieUrl?movieRootId=<id>`

Call this once status is `"ready"`.

**Response:**
```json
{
  "movieRootId": "xyz789",
  "movieId": "def456",
  "isReady": true,
  "videoUrl": "https://storage.googleapis.com/wonder-studio-prod-generated-videos/movies/abc.mp4",
  "watermarkedVideoUrl": null,
  "thumbnailUrl": "https://...",
  "title": "Generated Title"
}
```

- `videoUrl` — the primary HLS or MP4 URL (may be on Google Cloud Storage)
- `watermarkedVideoUrl` — a Popcorn-watermarked MP4 (needed for posting). May be `null` initially.
- `thumbnailUrl` — a still image preview frame

---

### Step 4 — Trigger Watermarked MP4

If `watermarkedVideoUrl` is `null`, you must request it explicitly:

**Endpoint:** `POST {POPCORN_API_URL}/api/mcp/triggerWatermarkedVideo`

**Request body:**
```json
{
  "movieRootId": "xyz789"
}
```

**Response:**
```json
{
  "watermarkedVideoUrl": "https://storage.googleapis.com/wonder-studio-prod-generated-videos/movies/xyz-watermarked.mp4"
}
```

After triggering, call `getMovieUrl` again on the next poll cycle. The watermarked MP4 is usually ready within 1–2 minutes.

---

### Step 5 — Compress Before Posting

Popcorn watermarked MP4s are typically **~6.5 MB**, which exceeds the upload limit of most posting services.

**Always compress via Cloudinary before posting:**

```typescript
import { compressVideo } from "@/lib/video/compress";

const compressedUrl = await compressVideo(watermarkedVideoUrl);
// Returns a Cloudinary URL like:
// https://res.cloudinary.com/dycsugl3a/video/upload/br_500k,c_scale,q_auto:low,w_720/v.../abc.mp4
// Resulting file size: ~1 MB for a 15s clip
```

The `compressVideo` function:
1. Uploads the source video to Cloudinary
2. Applies: `bit_rate: 500k`, `quality: auto:low`, `width: 720`, `crop: scale`
3. Returns a pre-rendered eager URL (immediately downloadable)

**Cloudinary env vars required:**
```
CLOUDINARY_CLOUD_NAME=dycsugl3a
CLOUDINARY_API_KEY=647139242111185
CLOUDINARY_API_SECRET=<secret>
```

---

## How It's Used in Xponential

### Auto-Reply Video Flow (2-phase cron)

**Cron: `/api/cron/process-videos` — runs every 3 minutes**

**Phase 1 — Kick off** (`status: pending`, `movieRootId: null`):
1. Find pending video auto-reply logs
2. Generate a text caption via OpenAI
3. Call `createMovie()` with prompt = tweet URL
4. Store `movieRootId`, set `status: "generating_video"`

**Phase 2 — Check status** (`status: generating_video`):
1. Call `getMovieStatus()` — if still processing, skip
2. When `status: "ready"`, call `getMovieUrl()`
3. If `watermarkedVideoUrl` is null, call `triggerWatermarkedVideo()` and wait for next cycle
4. Once `watermarkedVideoUrl` is available:
   - **Auto mode**: compress → post via Apify → set `status: "posting_video"`
   - **Manual mode**: save URL → set `status: "pending"` for user approval

**Phase 3 — Confirm post** (`status: posting_video`):
1. Poll Apify run for completion
2. On success, set `status: "posted"`, record in `post_history`

### Key Files

| File | Purpose |
|---|---|
| `src/lib/video/popcorn.ts` | All Popcorn API calls (`createMovie`, `getMovieStatus`, `getMovieUrl`, `triggerWatermarkedVideo`) |
| `src/lib/video/compress.ts` | Cloudinary compression (`compressVideo`) |
| `src/lib/auto-reply/video-processor.ts` | Full 3-phase processing loop |
| `src/app/api/cron/process-videos/route.ts` | Cron endpoint that runs `processVideoReplies()` |
| `src/app/api/settings/popcorn/route.ts` | GET/PUT/DELETE for user's `popcornUserId` |
| `src/app/api/video/create/route.ts` | Manual video creation endpoint |

### Database Fields (AutoReplyLog)

| Field | Description |
|---|---|
| `movieRootId` | Popcorn job ID, set after `createMovie()` |
| `videoUrl` | GCS URL from `watermarkedVideoUrl` |
| `generationStartedAt` | Timestamp when Popcorn job was kicked off |
| `apifyRunId` | Apify run ID for async tweet posting |
| `replyType` | `"video"` or `"text"` |
| `status` | `pending` → `generating_video` → `posting_video` → `posted` / `failed` |

---

## Per-User Setup

Each user needs their own Popcorn account ID set in Settings:

1. User gets their `popcornUserId` from their Popcorn account
2. User enters it at `/settings` in the app
3. Stored in `users.settings` JSON as `{ "popcornUserId": "abc123" }`
4. The app reads it before every `createMovie()` call

To set programmatically:
```
PUT /api/settings/popcorn
{ "popcornUserId": "abc123" }
```

---

## Example: Create and Poll a Video

```typescript
import { createMovie, getMovieStatus, getMovieUrl, triggerWatermarkedVideo } from "@/lib/video/popcorn";
import { compressVideo } from "@/lib/video/compress";

// 1. Create
const movie = await createMovie({
  prompt: "Create a video based off this tweet https://x.com/elonmusk/status/123456",
  duration: "15",
  orientation: "vertical",
  quality: "budget",
  style: "muppet",
  userId: "user-popcorn-id",
});
const { movieRootId } = movie;

// 2. Poll (repeat every 30s until ready)
let status = await getMovieStatus(movieRootId);
while (status.status !== "ready") {
  await new Promise(r => setTimeout(r, 30_000));
  status = await getMovieStatus(movieRootId);
}

// 3. Get URL
const movieUrl = await getMovieUrl(movieRootId);

// 4. Trigger watermarked MP4 if not yet ready
if (!movieUrl.watermarkedVideoUrl) {
  await triggerWatermarkedVideo(movieRootId);
  // Poll getMovieUrl again in next cycle until watermarkedVideoUrl is populated
}

// 5. Compress before posting
const compressedUrl = await compressVideo(movieUrl.watermarkedVideoUrl!);

// 6. Post (compressedUrl is a direct ~1MB MP4 ready for upload)
```
