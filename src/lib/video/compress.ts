/**
 * Compresses a video by uploading it to Cloudinary with a bitrate cap.
 * Returns a public URL of the compressed file.
 *
 * Target: under 5MB so Apify's actor can upload it to Twitter.
 * At 500kbps a 15s video is ~937KB — well within the limit.
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
    eager: [{ bit_rate: "500k", quality: "auto:low" }],
    eager_async: false,
  });

  const compressed = result.eager?.[0]?.secure_url;
  if (!compressed) {
    throw new Error("Cloudinary did not return a compressed video URL");
  }

  console.log(`[Compress] Done: ${compressed}`);
  return compressed;
}
