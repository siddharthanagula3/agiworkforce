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

  it('cuts on a whole character, never between the halves of a surrogate pair', () => {
    const emoji = '\u{1F600}';
    const cutInPair = `${'a'.repeat(MAX_FILENAME_CHARS - 1)}${emoji}${'b'.repeat(10)}`;
    const safe = sanitizeFilename(cutInPair);
    expect(safe).toBe('a'.repeat(MAX_FILENAME_CHARS - 1));
    expect(() => encodeURIComponent(safe)).not.toThrow();

    const withExtension = `${'a'.repeat(MAX_FILENAME_CHARS - 5)}${emoji}${'b'.repeat(10)}.csv`;
    const kept = sanitizeFilename(withExtension);
    expect(kept).toBe(`${'a'.repeat(MAX_FILENAME_CHARS - 5)}.csv`);
    expect(() => encodeURIComponent(kept)).not.toThrow();
  });

  it('keeps a pair that ends exactly at the limit', () => {
    const emoji = '\u{1F600}';
    const fits = `${'a'.repeat(MAX_FILENAME_CHARS - 2)}${emoji}${'b'.repeat(10)}`;
    const safe = sanitizeFilename(fits);
    expect(safe).toBe(`${'a'.repeat(MAX_FILENAME_CHARS - 2)}${emoji}`);
    expect(safe).toHaveLength(MAX_FILENAME_CHARS);
  });

  it('flags a name that carries a path', () => {
    expect(filenameIsUnsafe('notes.md')).toBe(false);
    expect(filenameIsUnsafe('dir/notes.md')).toBe(true);
    expect(filenameIsUnsafe('C:notes.md')).toBe(true);
    expect(filenameIsUnsafe('')).toBe(true);
  });
});
