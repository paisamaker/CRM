import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import { env } from '../config/env.js';
import { getSettings } from '../models/Settings.js';

let isConfigured = false;

export async function initCloudinary(): Promise<boolean> {
  const settings = await getSettings().catch(() => null);
  const cloudName =
    env.CLOUDINARY_CLOUD_NAME ||
    settings?.get?.('cloudinary.cloudName') ||
    process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey =
    env.CLOUDINARY_API_KEY ||
    settings?.get?.('cloudinary.apiKey') ||
    process.env.CLOUDINARY_API_KEY;
  const apiSecret =
    env.CLOUDINARY_API_SECRET ||
    settings?.get?.('cloudinary.apiSecret') ||
    process.env.CLOUDINARY_API_SECRET;

  if (cloudName && apiKey && apiSecret) {
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });
    isConfigured = true;
    return true;
  }
  return false;
}

/**
 * Upload an image file (from disk path) to Cloudinary.
 * If Cloudinary is not configured or throws, returns null so caller can fallback to local storage.
 */
export async function uploadImageToCloudinary(
  filePath: string,
  folder = 'starmedia/avatars'
): Promise<{ secure_url: string; public_id: string } | null> {
  try {
    const ready = isConfigured || (await initCloudinary());
    if (!ready) return null;

    const result = await cloudinary.uploader.upload(filePath, {
      folder,
      resource_type: 'image',
      transformation: [
        { width: 400, height: 400, crop: 'fill', gravity: 'face' },
        { quality: 'auto', fetch_format: 'auto' },
      ],
    });

    // Optionally cleanup local temporary file after Cloudinary upload
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // ignore cleanup error
      }
    }

    return {
      secure_url: result.secure_url,
      public_id: result.public_id,
    };
  } catch (err) {
    console.warn('[Cloudinary] Upload failed, falling back to local file storage:', err);
    return null;
  }
}
