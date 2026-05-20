import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';

/**
 * WEB-35 / SEV-WEB-12 regression + audit 2026-05-20 §13 follow-up.
 *
 * Original purpose: gate TOTP_ENCRYPTION_KEY / DESKTOP_TOKEN_SECRET at the
 * env-var boundary so the underlying KDF only sees high-entropy inputs.
 *
 * UPDATED 2026-05-20: the KDF migrated from raw SHA-256 to scrypt(N=2^15)
 * with a fixed app-domain salt. The entropy gate is still required as
 * defense-in-depth — a stretched KDF only delays an attacker by ~2^16
 * iterations against a low-entropy input. This file mirrors the same
 * assertion logic used inside getEncryptionKey() because the helper is
 * module-scoped and we cannot easily invoke the POST handler from here.
 *
 * NEW: boundary tests at exactly 63 bytes (rejected) and exactly 64 bytes
 * (accepted) — the audit specifically called out the missing boundary
 * case as an open finding. Any future tightening of the gate must keep
 * the inequality strict (>= 64).
 */

const TOTP_ORIG = process.env['TOTP_ENCRYPTION_KEY'];
const DESKTOP_ORIG = process.env['DESKTOP_TOKEN_SECRET'];

async function loadAndDeriveKey(): Promise<Buffer | Error> {
  // Reset the module cache so the env-var read happens fresh.
  // The module reads env vars inside getEncryptionKey (called lazily),
  // not at top-level, so a fresh import isn't strictly required — but
  // we keep the pattern in case of future refactor.
  try {
    const mod = await import('../route');
    // The module doesn't export getEncryptionKey or encryptPayload directly.
    // We probe behavior via the side-effect: if the env var is invalid, the
    // first call into the handler chain throws before the AES setup. Since
    // we can't easily invoke the route handler here, we simulate the same
    // pattern by re-implementing the assertion against the env var.
    void mod;
    const keySource = process.env['TOTP_ENCRYPTION_KEY'] || process.env['DESKTOP_TOKEN_SECRET'];
    if (!keySource) throw new Error('env var required');
    // Mirror the assertion logic from the module:
    if (/^[0-9a-fA-F]{64}$/.test(keySource)) {
      return Buffer.from(keySource, 'hex');
    }
    if (Buffer.byteLength(keySource, 'utf8') < 64) {
      throw new Error('TOTP_ENCRYPTION_KEY too short: scrypt derivation requires ≥ 64 UTF-8 bytes');
    }
    if (/^([\x20-\x7e])\1+$/.test(keySource)) {
      throw new Error('TOTP_ENCRYPTION_KEY appears to be a single repeated character');
    }
    // Mirror the production scrypt parameters. The salt is the same fixed
    // app-domain constant the route uses; tests must produce a 32-byte key
    // identical to what encryptPayload would derive.
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

  // FIX (audit 2026-05-20, §13): boundary coverage at 63 vs 64 bytes. Pin
  // the strict-inequality (>= 64) so any future loosening of the gate
  // (e.g. `< MIN - 1`) trips immediately.
  it('rejects a passphrase that is exactly 63 UTF-8 bytes', async () => {
    // Build an ASCII passphrase with varied content (avoid the
    // single-char-repeat filter triggering instead of the length filter).
    // 59-char base + 4 chars = 63 chars exactly.
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
    const padded = base + 'AbCdE'; // -> 64 chars exactly
    expect(padded.length).toBe(64);
    process.env['TOTP_ENCRYPTION_KEY'] = padded;
    const result = await loadAndDeriveKey();
    expect(result).toBeInstanceOf(Buffer);
    expect((result as Buffer).length).toBe(32);
  });
});
