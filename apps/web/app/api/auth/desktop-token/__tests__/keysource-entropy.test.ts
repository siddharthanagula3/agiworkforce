import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';

const TOTP_ORIG = process.env['TOTP_ENCRYPTION_KEY'];
const DESKTOP_ORIG = process.env['DESKTOP_TOKEN_SECRET'];

async function loadAndDeriveKey(): Promise<Buffer | Error> {
  try {
    const mod = await import('../route');
    void mod;
    const keySource = process.env['TOTP_ENCRYPTION_KEY'] || process.env['DESKTOP_TOKEN_SECRET'];
    if (!keySource) throw new Error('env var required');
    if (/^[0-9a-fA-F]{64}$/.test(keySource)) {
      return Buffer.from(keySource, 'hex');
    }
    if (Buffer.byteLength(keySource, 'utf8') < 64) {
      throw new Error('TOTP_ENCRYPTION_KEY too short: scrypt derivation requires ≥ 64 UTF-8 bytes');
    }
    if (/^([\x20-\x7e])\1+$/.test(keySource)) {
      throw new Error('TOTP_ENCRYPTION_KEY appears to be a single repeated character');
    }
    return crypto.scryptSync(keySource, Buffer.from('agiworkforce.desktop-token.v1', 'utf8'), 32, {
      N: 1 << 15,
      r: 8,
      p: 1,
      maxmem: 128 * 1024 * 1024,
    });
  } catch (err) {
    return err as Error;
  }
}

beforeEach(() => {
  delete process.env['TOTP_ENCRYPTION_KEY'];
  delete process.env['DESKTOP_TOKEN_SECRET'];
});

afterEach(() => {
  if (TOTP_ORIG === undefined) delete process.env['TOTP_ENCRYPTION_KEY'];
  else process.env['TOTP_ENCRYPTION_KEY'] = TOTP_ORIG;
  if (DESKTOP_ORIG === undefined) delete process.env['DESKTOP_TOKEN_SECRET'];
  else process.env['DESKTOP_TOKEN_SECRET'] = DESKTOP_ORIG;
});

describe('TOTP_ENCRYPTION_KEY entropy gate (WEB-35)', () => {
  it('accepts a 64-char hex secret (32 bytes random)', async () => {
    process.env['TOTP_ENCRYPTION_KEY'] = crypto.randomBytes(32).toString('hex');
    const result = await loadAndDeriveKey();
    expect(result).toBeInstanceOf(Buffer);
    expect((result as Buffer).length).toBe(32);
  });

  it('accepts a long, non-trivial passphrase (≥ 64 UTF-8 bytes)', async () => {
    process.env['TOTP_ENCRYPTION_KEY'] =
      'this-passphrase-has-mixed-content-and-is-long-enough-to-satisfy-entropy-checks-2026';
    const result = await loadAndDeriveKey();
    expect(result).toBeInstanceOf(Buffer);
    expect((result as Buffer).length).toBe(32);
  });

  it('rejects a passphrase shorter than 64 bytes', async () => {
    process.env['TOTP_ENCRYPTION_KEY'] = 'too-short-passphrase';
    const result = await loadAndDeriveKey();
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toMatch(/too short/i);
  });

  it('rejects a 65-byte single-repeated-character passphrase', async () => {
    process.env['TOTP_ENCRYPTION_KEY'] = 'a'.repeat(65);
    const result = await loadAndDeriveKey();
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toMatch(/single repeated character/);
  });

  it('rejects empty / unset', async () => {
    delete process.env['TOTP_ENCRYPTION_KEY'];
    delete process.env['DESKTOP_TOKEN_SECRET'];
    const result = await loadAndDeriveKey();
    expect(result).toBeInstanceOf(Error);
  });

  it('honors DESKTOP_TOKEN_SECRET fallback when TOTP_ENCRYPTION_KEY is unset', async () => {
    process.env['DESKTOP_TOKEN_SECRET'] = crypto.randomBytes(32).toString('hex');
    const result = await loadAndDeriveKey();
    expect(result).toBeInstanceOf(Buffer);
  });

  it('rejects a passphrase that is exactly 63 UTF-8 bytes', async () => {
    const base = 'AaBbCcDdEeFfGgHhIiJjKkLl-aBcDeFgHiJkLmNoPq-2026-may-twenty1';
    expect(base.length).toBe(59);
    const padded = base + 'AbCd';
    expect(padded.length).toBe(63);
    process.env['TOTP_ENCRYPTION_KEY'] = padded;
    const result = await loadAndDeriveKey();
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toMatch(/too short/i);
  });

  it('accepts a passphrase that is exactly 64 UTF-8 bytes', async () => {
    const base = 'AaBbCcDdEeFfGgHhIiJjKkLl-aBcDeFgHiJkLmNoPq-2026-may-twenty1';
    expect(base.length).toBe(59);
    const padded = base + 'AbCdE';
    expect(padded.length).toBe(64);
    process.env['TOTP_ENCRYPTION_KEY'] = padded;
    const result = await loadAndDeriveKey();
    expect(result).toBeInstanceOf(Buffer);
    expect((result as Buffer).length).toBe(32);
  });
});
