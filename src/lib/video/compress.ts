/**
 * Downloads a video from a URL, compresses it with FFmpeg (WASM),
 * uploads the result to Supabase Storage, and returns a public URL.
 *
 * Used to bring Popcorn watermarked MP4s under 5MB before passing
 * to the Apify actor, which silently drops videos above that limit.
 */

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET = "compressed-videos";

/**
 * Compresses an MP4 from a remote URL and uploads it to Supabase Storage.
 * Returns the public URL of the compressed file.
 */
export async function compressAndUploadVideo(
  sourceUrl: string,
  filename: string
): Promise<string> {
  // ── 1. Load FFmpeg WASM from CDN ─────────────────────────────
  const ffmpeg = new FFmpeg();
  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";

  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(
      `${baseURL}/ffmpeg-core.wasm`,
      "application/wasm"
    ),
  });

  // ── 2. Write input file into FFmpeg's virtual FS ─────────────
  console.log(`[Compress] Downloading source video: ${sourceUrl.slice(0, 80)}...`);
  await ffmpeg.writeFile("input.mp4", await fetchFile(sourceUrl));

  // ── 3. Compress: H.264, CRF 28 (good size/quality balance) ──
  // CRF 28 + fast preset should bring a 6.5MB video well under 5MB.
  // Increase CRF (e.g. 32) if still too large; decrease for better quality.
  console.log(`[Compress] Running FFmpeg compression...`);
  await ffmpeg.exec([
    "-i", "input.mp4",
    "-c:v", "libx264",
    "-crf", "28",
    "-preset", "fast",
    "-c:a", "aac",
    "-b:a", "96k",
    "output.mp4",
  ]);

  // ── 4. Read compressed file out of FFmpeg's virtual FS ───────
  const compressed = await ffmpeg.readFile("output.mp4");
  const buffer = Buffer.from(compressed as Uint8Array);
  console.log(
    `[Compress] Compressed to ${(buffer.length / 1024 / 1024).toFixed(2)} MB`
  );

  // ── 5. Upload to Supabase Storage ────────────────────────────
  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${filename}`;
  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "video/mp4",
      "x-upsert": "true", // overwrite if same filename
    },
    body: buffer,
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`Supabase upload failed (HTTP ${uploadRes.status}): ${err}`);
  }

  // ── 6. Return the public URL ──────────────────────────────────
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${filename}`;
  console.log(`[Compress] Uploaded: ${publicUrl}`);
  return publicUrl;
}
