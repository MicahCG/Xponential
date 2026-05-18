# Popcorn Video Generation — Agent Instructions

Instructions for generating short AI videos via the Popcorn MCP API.

---

## Credentials

```
Base URL:  https://www.popcorn.co
API Key:   855276ca362434b783ca29d832b7a760
User ID:   ObTTKRawcHbFFi6Z1fLVL1EViNg2
```

- **Base URL** — prepended to all endpoint paths
- **API Key** — sent as the `x-api-key` header on every request. POST requests also need `Content-Type: application/json`.
- **User ID** — the Popcorn account ID, passed as `userId` in the `createMovie` body

---

## API Endpoints

### 1. Create Movie — `POST /api/mcp/createMovie`

Kicks off an async video generation job. Returns immediately.

**Request body:**

```json
{
  "prompt": "A dramatic cinematic scene of a cat riding a skateboard",
  "duration": "15",
  "orientation": "vertical",
  "style": "cinematic",
  "quality": "medium",
  "userId": "ObTTKRawcHbFFi6Z1fLVL1EViNg2"
}
```

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `prompt` | string | **Yes** | — | Text describing the video content |
| `userId` | string | **Yes** | — | Popcorn account ID (see Credentials above) |
| `duration` | `"15"` \| `"30"` \| `"45"` \| `"60"` | No | `"15"` | Video length in seconds |
| `orientation` | `"vertical"` \| `"horizontal"` | No | `"vertical"` | Aspect ratio — vertical is 9:16, horizontal is 16:9 |
| `style` | string | No | `"cinematic"` | Visual style (see options below) |
| `quality` | string | No | `"medium"` | Affects generation time and cost (see options below) |

**Style options:** `"muppet"`, `"cinematic"`, `"anime"`, `"cartoon"`, `"realistic"`, `"watercolor"`, `"3d render"`, `"claymation"`, `"pixel art"`, `"vintage film"`

**Quality options:** `"budget"`, `"low"`, `"medium"`, `"high"`, `"premium"`, `"professional"`

**Response:**

```json
{
  "conversationId": "abc-123",
  "movieRootId": "xyz-789"
}
```

Save the `movieRootId` — it is the key for all subsequent calls.

---

### 2. Get Movie Status — `GET /api/mcp/getMovieStatus?movieRootId=<id>`

Polls generation progress.

**Query parameters:** `movieRootId` (required)

**Response:**

```json
{
  "found": true,
  "movieRootId": "xyz-789",
  "movieId": "movie-456",
  "status": "processing",
  "title": "Auto-generated title",
  "videoUrl": null,
  "watermarkedVideoUrl": null,
  "thumbnailUrl": null
}
```

| Field | Description |
|---|---|
| `status` | `"processing"` (still generating) or `"ready"` (done) |
| `videoUrl` | HLS manifest URL (available when ready) |
| `watermarkedVideoUrl` | Direct MP4 with Popcorn watermark (may be null even when ready — see endpoint 4) |
| `thumbnailUrl` | Still image preview |

**Polling strategy:**
- Poll every 30–60 seconds
- Typical generation time: 5–15 minutes
- Timeout after 60 minutes — treat as failed

**Note:** HTTP 202 is a successful response (async accepted).

---

### 3. Get Movie URL — `GET /api/mcp/getMovieUrl?movieRootId=<id>`

Retrieves final video URLs once status is `"ready"`.

**Query parameters:** `movieRootId` (required)

**Response:**

```json
{
  "movieRootId": "xyz-789",
  "movieId": "movie-456",
  "isReady": true,
  "videoUrl": "https://storage.googleapis.com/.../master.m3u8",
  "watermarkedVideoUrl": "https://storage.googleapis.com/.../watermarked.mp4",
  "thumbnailUrl": "https://storage.googleapis.com/.../thumb.jpg",
  "title": "Auto-generated title"
}
```

| Field | Description |
|---|---|
| `videoUrl` | HLS manifest (.m3u8) — **not** a direct MP4 |
| `watermarkedVideoUrl` | Direct MP4 file (~6.5 MB for a 15s clip). **This is the downloadable video.** |
| `thumbnailUrl` | Still image |

---

### 4. Trigger Watermarked Video — `POST /api/mcp/triggerWatermarkedVideo`

If `getMovieUrl` returns `watermarkedVideoUrl: null`, call this to request MP4 generation.

**Request body:**

```json
{
  "movieRootId": "xyz-789"
}
```

The watermarked URL won't be immediately available. Wait 1–2 minutes, then call `getMovieUrl` again.

---

## End-to-End Flow

```
1. POST /api/mcp/createMovie  →  get movieRootId

2. GET /api/mcp/getMovieStatus?movieRootId=<id>  (poll every 30–60s)
   └─ repeat until status === "ready"  (timeout at 60 min)

3. GET /api/mcp/getMovieUrl?movieRootId=<id>
   └─ check watermarkedVideoUrl

4. If watermarkedVideoUrl is null:
   a. POST /api/mcp/triggerWatermarkedVideo  { movieRootId }
   b. Wait 1–2 minutes
   c. GET /api/mcp/getMovieUrl again
   d. Repeat until watermarkedVideoUrl is populated

5. watermarkedVideoUrl is the final downloadable MP4
```

### Code Example

```typescript
const BASE = "https://www.popcorn.co";
const API_KEY = "855276ca362434b783ca29d832b7a760";
const USER_ID = "ObTTKRawcHbFFi6Z1fLVL1EViNg2";

const headers = { "x-api-key": API_KEY, "Content-Type": "application/json" };

// 1. Create
const createRes = await fetch(`${BASE}/api/mcp/createMovie`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    prompt: "A dramatic cinematic scene of a cat riding a skateboard",
    duration: "15",
    orientation: "vertical",
    style: "cinematic",
    quality: "medium",
    userId: USER_ID,
  }),
});
const { movieRootId } = await createRes.json();

// 2. Poll until ready
let status;
do {
  await new Promise(r => setTimeout(r, 30_000)); // 30s
  const res = await fetch(`${BASE}/api/mcp/getMovieStatus?movieRootId=${movieRootId}`, {
    headers: { "x-api-key": API_KEY },
  });
  status = await res.json();
} while (status.status !== "ready");

// 3. Get video URL
let movie = await (await fetch(`${BASE}/api/mcp/getMovieUrl?movieRootId=${movieRootId}`, {
  headers: { "x-api-key": API_KEY },
})).json();

// 4. Trigger watermarked MP4 if needed
if (!movie.watermarkedVideoUrl) {
  await fetch(`${BASE}/api/mcp/triggerWatermarkedVideo`, {
    method: "POST",
    headers,
    body: JSON.stringify({ movieRootId }),
  });
  await new Promise(r => setTimeout(r, 120_000)); // wait 2 min
  movie = await (await fetch(`${BASE}/api/mcp/getMovieUrl?movieRootId=${movieRootId}`, {
    headers: { "x-api-key": API_KEY },
  })).json();
}

// 5. Done — movie.watermarkedVideoUrl is the MP4
console.log("Video URL:", movie.watermarkedVideoUrl);
```

---

## Key Gotchas

1. **`videoUrl` is HLS, not MP4.** Don't try to download it directly. Use `watermarkedVideoUrl` for a usable MP4 file.

2. **Watermarked URL may be null initially.** Even when status is `"ready"`, `watermarkedVideoUrl` can be null. You must call `triggerWatermarkedVideo` and poll `getMovieUrl` again.

3. **Generation is slow.** Expect 5–15 minutes. Design for async polling, not synchronous waiting.

4. **HTTP 202 is OK.** Popcorn returns 202 (Accepted) for async operations — treat it as success, not an error.

5. **File size.** The raw watermarked MP4 is ~6.5 MB for a 15s clip.

---

## Error Handling

- Non-2xx responses (except 202) indicate failure — the response body contains the error message
- If `getMovieStatus` returns `found: false`, the `movieRootId` is invalid
- If still `"processing"` after 60 minutes, consider the job failed
