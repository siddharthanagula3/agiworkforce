import { describe, expect, it } from 'vitest';

import {
  FALLBACK_FILENAME,
  MAX_FILENAME_CHARS,
  REDACTED,
  filenameIsUnsafe,
  redactLogRecord,
  redactSecrets,
  redactSecretsDeep,
  sanitizeFilename,
} from '..';

describe('redactSecrets', () => {
  it('masks bearer tokens, provider keys and addresses in free text', () => {
    expect(redactSecrets('call failed for person@example.com')).toBe(`call failed for ${REDACTED}`);
    expect(redactSecrets('Authorization: Bearer abcdef0123456789')).toContain(REDACTED);
    expect(redactSecrets('key sk_live_FAKEFAKEFAKE0001 rotated')).toBe(`key ${REDACTED} rotated`);
    expect(redactSecrets('token ghp_FAKEFAKEFAKEFAKE0001')).toBe(`token ${REDACTED}`);
  });

  it('leaves text carrying no secret untouched', () => {
    expect(redactSecrets('upload accepted in 12ms')).toBe('upload accepted in 12ms');
  });
});

describe('redactSecretsDeep and redactLogRecord', () => {
  it('replaces denied keys and masks nested strings', () => {
    const record = redactLogRecord({
      apiKey: 'plain-looking-value',
      nested: { password: 'hunter2', note: 'mail bob@example.com' },
      count: 3,
    });
    expect(record['apiKey']).toBe(REDACTED);
    expect((record['nested'] as Record<string, unknown>)['password']).toBe(REDACTED);
    expect((record['nested'] as Record<string, unknown>)['note']).toBe(`mail ${REDACTED}`);
    expect(record['count']).toBe(3);
  });

  it('masks an error message and its stack', () => {
    const redacted = redactSecretsDeep(new Error('denied for person@example.com')) as {
      message: string;
    };
    expect(redacted.message).toBe(`denied for ${REDACTED}`);
  });
});

describe('sanitizeFilename', () => {
  it('reduces a path to its final segment', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('..\\..\\windows\\system32\\config')).toBe('config');
    expect(sanitizeFilename('C:\\Users\\bob\\notes.txt')).toBe('notes.txt');
  });

  it('falls back when nothing usable is left', () => {
    expect(sanitizeFilename('..')).toBe(FALLBACK_FILENAME);
    expect(sanitizeFilename('/')).toBe(FALLBACK_FILENAME);
    expect(sanitizeFilename('   ')).toBe(FALLBACK_FILENAME);
  });

  it('strips control characters and reserved characters', () => {
    expect(sanitizeFilename('rep\u0000ort.pdf')).toBe('report.pdf');
    expect(sanitizeFilename('q1:2026?.csv')).toBe('q1_2026_.csv');
  });

  it('bounds the length and keeps the extension', () => {
    const long = `${'a'.repeat(400)}.pdf`;
    const result = sanitizeFilename(long);
    expect(result.length).toBe(MAX_FILENAME_CHARS);
    expect(result.endsWith('.pdf')).toBe(true);
  });
});

describe('filenameIsUnsafe', () => {
  it('refuses a name that carries a path', () => {
    expect(filenameIsUnsafe('../../etc/passwd')).toBe(true);
    expect(filenameIsUnsafe('dir\\file.txt')).toBe(true);
    expect(filenameIsUnsafe('C:notes.txt')).toBe(true);
    expect(filenameIsUnsafe('report\u0000.pdf')).toBe(true);
    expect(filenameIsUnsafe('..')).toBe(true);
    expect(filenameIsUnsafe('')).toBe(true);
    expect(filenameIsUnsafe(`${'a'.repeat(400)}.pdf`)).toBe(true);
  });

  it('accepts an ordinary file name', () => {
    expect(filenameIsUnsafe('quarterly report.pdf')).toBe(false);
    expect(filenameIsUnsafe('.env.example')).toBe(false);
  });
});
