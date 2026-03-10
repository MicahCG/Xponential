/**
 * Uploads a video to Cloudinary and returns a transformation URL
 * that compresses it to ~500kbps on the fly.
 *
 * Cloudinary applies the transformation when the URL is first fetched
 * and caches the result. No eager processing required.
 *
 * At 500kbps a 21s clip is ~1.3MB — well under Apify's 5MB limit.
 */
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function compressVideo(sourceUrl: string): Promise<string> {
  console.log(`[Compress] Uploading to Cloudinary: ${sourceUrl.slice(0, 80)}...`);

  const result = await cloudinary.uploader.upload(sourceUrl, {
    resource_type: "video",
  });

  console.log(`[Compress] Original uploaded: ${(result.bytes / 1024 / 1024).toFixed(2)} MB (${result.public_id})`);

  // Build a URL with compression transformation baked in.
  // br_500k caps bitrate to 500kbps; q_auto:low reduces quality further.
  // Cloudinary transforms and serves compressed video when this URL is fetched.
  const compressedUrl = cloudinary.url(result.public_id, {
    resource_type: "video",
    transformation: [{ bit_rate: "500k", quality: "auto:low" }],
    format: "mp4",
    secure: true,
  });

  console.log(`[Compress] Compressed URL: ${compressedUrl}`);
  return compressedUrl;
}
