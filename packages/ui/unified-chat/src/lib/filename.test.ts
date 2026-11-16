import { describe, expect, it } from 'vitest';
import {
  FALLBACK_FILENAME,
  MAX_FILENAME_CHARS,
  filenameIsUnsafe,
  sanitizeFilename,
} from './filename';

describe('filename', () => {
  it('keeps one safe path segment', () => {
    expect(sanitizeFilename('C:\\Users\\me\\re:port?.pdf')).toBe('re_port_.pdf');
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('..')).toBe(FALLBACK_FILENAME);
    expect(sanitizeFilename('a\u0000b.txt')).toBe('ab.txt');
  });

  it('bounds the length and keeps the extension', () => {
    const long = `${'a'.repeat(300)}.csv`;
    const safe = sanitizeFilename(long);
    expect(safe).toHaveLength(MAX_FILENAME_CHARS);
    expect(safe.endsWith('.csv')).toBe(true);
  });

  it('flags a name that carries a path', () => {
    expect(filenameIsUnsafe('notes.md')).toBe(false);
    expect(filenameIsUnsafe('dir/notes.md')).toBe(true);
    expect(filenameIsUnsafe('C:notes.md')).toBe(true);
    expect(filenameIsUnsafe('')).toBe(true);
  });
});
