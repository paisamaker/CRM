import fs from 'fs';
import { AppError } from './AppError.js';

/** Magic-byte signatures for allowed upload types. */
const SIGNATURES: Array<{ mime: string; bytes: number[]; offset?: number }> = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 }, // RIFF....WEBP
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
];

function bufferMatches(buf: Buffer, expected: number[], offset = 0): boolean {
  if (buf.length < offset + expected.length) return false;
  return expected.every((b, i) => buf[offset + i] === b);
}

/**
 * Validate that a stored file's magic bytes match an allowed image/PDF type.
 * Rejects disguised executables even if the client sent a spoofed MIME type.
 */
export function assertSafeUploadSignature(filePath: string, claimedMime?: string): string {
  const fd = fs.openSync(filePath, 'r');
  try {
    const header = Buffer.alloc(16);
    fs.readSync(fd, header, 0, 16, 0);

    // WebP: RIFF....WEBP
    if (
      bufferMatches(header, [0x52, 0x49, 0x46, 0x46]) &&
      header.toString('ascii', 8, 12) === 'WEBP'
    ) {
      return 'image/webp';
    }

    for (const sig of SIGNATURES) {
      if (sig.mime === 'image/webp') continue;
      if (bufferMatches(header, sig.bytes, sig.offset || 0)) {
        return sig.mime;
      }
    }

    // CSV / DOCX are harder to fingerprint; allow when claimed MIME is already permitted
    // and file does not look like a PE/ELF executable.
    const isPe = bufferMatches(header, [0x4d, 0x5a]); // MZ
    const isElf = bufferMatches(header, [0x7f, 0x45, 0x4c, 0x46]);
    if (isPe || isElf) {
      throw new AppError('Executable files are not allowed', 400, 'INVALID_FILE_TYPE');
    }

    const softAllowed = new Set([
      'text/csv',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]);
    if (claimedMime && softAllowed.has(claimedMime)) {
      // DOCX is a ZIP (PK)
      if (
        claimedMime.includes('wordprocessingml') &&
        !bufferMatches(header, [0x50, 0x4b])
      ) {
        throw new AppError('File content does not match claimed type', 400, 'INVALID_FILE_TYPE');
      }
      return claimedMime;
    }

    throw new AppError('Unrecognized or unsupported file content', 400, 'INVALID_FILE_TYPE');
  } finally {
    fs.closeSync(fd);
  }
}
