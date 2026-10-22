import fs from 'fs';
import os from 'os';
import path from 'path';
import { assertSafeUploadSignature } from '../utils/fileSignature.js';

describe('assertSafeUploadSignature', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-sig-'));

  afterAll(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function write(name: string, bytes: number[]) {
    const filePath = path.join(tmp, name);
    fs.writeFileSync(filePath, Buffer.from(bytes));
    return filePath;
  }

  it('accepts JPEG magic bytes', () => {
    const file = write('a.jpg', [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(assertSafeUploadSignature(file, 'image/jpeg')).toBe('image/jpeg');
  });

  it('accepts PNG magic bytes', () => {
    const file = write('a.png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(assertSafeUploadSignature(file, 'image/png')).toBe('image/png');
  });

  it('accepts PDF magic bytes', () => {
    const file = write('a.pdf', [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    expect(assertSafeUploadSignature(file, 'application/pdf')).toBe('application/pdf');
  });

  it('rejects PE executables', () => {
    const file = write('evil.exe', [0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);
    expect(() => assertSafeUploadSignature(file, 'image/jpeg')).toThrow(/Executable|Unrecognized|unsupported/i);
  });
});
