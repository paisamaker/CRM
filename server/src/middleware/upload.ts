import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { assertSafeUploadSignature } from '../utils/fileSignature.js';
import { uploadDocumentToCloudinary } from '../utils/cloudinary.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadRoot = path.resolve(__dirname, '../../uploads');

if (!fs.existsSync(uploadRoot)) {
  fs.mkdirSync(uploadRoot, { recursive: true });
}

const ALLOWED = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    cb(null, `${Date.now()}-${safe}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: env.UPLOAD_MAX_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.has(file.mimetype)) {
      return cb(new AppError('File type not allowed', 400, 'INVALID_FILE_TYPE') as unknown as Error);
    }
    cb(null, true);
  },
});

export function publicUploadPath(filename: string) {
  return `/api/v1/files/${filename}`;
}

/** Validate magic bytes and optionally promote the file to Cloudinary. */
export async function finalizeUploadedFile(file: Express.Multer.File): Promise<{
  url: string;
  mime: string;
  name: string;
  size: number;
}> {
  const mime = assertSafeUploadSignature(file.path, file.mimetype);
  let url = publicUploadPath(file.filename);
  if (env.STORAGE_PROVIDER === 'cloudinary') {
    const cloud = await uploadDocumentToCloudinary(file.path, 'starmedia/uploads');
    if (cloud?.secure_url) {
      url = cloud.secure_url;
      try {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      } catch {
        /* ignore */
      }
    }
  }
  return { url, mime, name: file.originalname, size: file.size };
}
