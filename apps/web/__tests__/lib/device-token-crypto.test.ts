/**
 * Device Token Crypto Tests
 *
 * Tests for AES-256-GCM encryption/decryption of device tokens.
 * Covers: round-trip correctness, IV uniqueness, auth tag tamper detection,
 * key derivation paths, edge cases (empty string, long JWT).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Store original env so we can restore it after each test
const originalEnv = { ...process.env };

// A valid 64-hex-char (32-byte) key for explicit-key tests
const VALID_HEX_KEY = 'a'.repeat(64); // 32 bytes of 0xaa

// A representative JWT-shaped token (simulates a real Supabase access token)
const LONG_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  'eyJzdWIiOiJ1c2VyLTEyMy00NTYtNzg5IiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwicm9sZSI6InVzZXIiLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MTcwMDAwMzYwMH0.' +
  'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

describe('device-token-crypto', () => {
  beforeEach(() => {
    // Reset module registry so env changes are picked up by the module
    vi.resetModules();
    // Start with a clean env using the explicit key
    process.env.DEVICE_TOKEN_ENCRYPTION_KEY = VALID_HEX_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
  });

  // ---------------------------------------------------------------------------
  // Round-trip: encrypt → decrypt returns original plaintext
  // ---------------------------------------------------------------------------
  describe('encryptToken / decryptToken round-trip', () => {
    it('should return the original token after encrypt then decrypt', async () => {
      const { encryptToken, decryptToken } = await import('@/lib/device-token-crypto');

      const original = 'device-token-abc-123';
      const encrypted = encryptToken(original);
      const decrypted = decryptToken(encrypted);

      expect(decrypted).toBe(original);
    });

    it('should round-trip a long JWT-shaped token', async () => {
      const { encryptToken, decryptToken } = await import('@/lib/device-token-crypto');

      const encrypted = encryptToken(LONG_JWT);
      const decrypted = decryptToken(encrypted);

      expect(decrypted).toBe(LONG_JWT);
    });

    it('should throw when decrypting an empty-string ciphertext (minimum length guard)', async () => {
      // AES-256-GCM of an empty plaintext produces IV(12) + 0 bytes ciphertext + authTag(16) = 28 bytes.
      // decryptToken enforces a minimum of IV_LENGTH + AUTH_TAG_LENGTH + 1 = 29 bytes, so
      // encrypting the empty string and then decrypting it triggers the "too short" guard.
      const { encryptToken, decryptToken } = await import('@/lib/device-token-crypto');

      const encrypted = encryptToken('');
      expect(() => decryptToken(encrypted)).toThrow('Invalid encrypted token: too short');
    });

    it('should produce a base64-encoded ciphertext', async () => {
      const { encryptToken } = await import('@/lib/device-token-crypto');

      const encrypted = encryptToken('some-token');

      // Valid base64 — should not throw when decoded
      expect(() => Buffer.from(encrypted, 'base64')).not.toThrow();
      // Should be longer than the raw plaintext (IV + ciphertext + auth tag overhead)
      expect(encrypted.length).toBeGreaterThan('some-token'.length);
    });
  });

  // ---------------------------------------------------------------------------
  // IV uniqueness: two encryptions of the same plaintext differ
  // ---------------------------------------------------------------------------
  describe('IV uniqueness', () => {
    it('should produce different ciphertexts for the same plaintext', async () => {
      const { encryptToken } = await import('@/lib/device-token-crypto');

      const plaintext = 'same-token-every-time';
      const enc1 = encryptToken(plaintext);
      const enc2 = encryptToken(plaintext);

      expect(enc1).not.toBe(enc2);
    });

    it('should still decrypt both ciphertexts to the same original plaintext', async () => {
      const { encryptToken, decryptToken } = await import('@/lib/device-token-crypto');

      const plaintext = 'same-token-every-time';
      const enc1 = encryptToken(plaintext);
      const enc2 = encryptToken(plaintext);

      expect(decryptToken(enc1)).toBe(plaintext);
      expect(decryptToken(enc2)).toBe(plaintext);
    });
  });

  // ---------------------------------------------------------------------------
  // Auth tag tampering: modified ciphertext must not decrypt successfully
  // ---------------------------------------------------------------------------
  describe('auth tag tamper detection', () => {
    it('should throw when the auth tag is corrupted', async () => {
      const { encryptToken, decryptToken } = await import('@/lib/device-token-crypto');

      const encrypted = encryptToken('sensitive-device-token');
      const buf = Buffer.from(encrypted, 'base64');

      // Flip the last byte (part of the 16-byte auth tag)
      buf[buf.length - 1] ^= 0xff;
      const tampered = buf.toString('base64');

      expect(() => decryptToken(tampered)).toThrow();
    });

    it('should throw when the ciphertext body is corrupted', async () => {
      const { encryptToken, decryptToken } = await import('@/lib/device-token-crypto');

      const encrypted = encryptToken('another-device-token');
      const buf = Buffer.from(encrypted, 'base64');

      // IV is first 12 bytes; flip a byte in the ciphertext region (byte 12)
      buf[12] ^= 0x01;
      const tampered = buf.toString('base64');

      expect(() => decryptToken(tampered)).toThrow();
    });

    it('should throw when the IV is corrupted', async () => {
      const { encryptToken, decryptToken } = await import('@/lib/device-token-crypto');

      const encrypted = encryptToken('yet-another-token');
      const buf = Buffer.from(encrypted, 'base64');

      // Flip a byte inside the IV (first 12 bytes)
      buf[0] ^= 0xff;
      const tampered = buf.toString('base64');

      expect(() => decryptToken(tampered)).toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Key derivation paths
  // ---------------------------------------------------------------------------
  describe('key derivation — explicit DEVICE_TOKEN_ENCRYPTION_KEY', () => {
    it('should encrypt/decrypt successfully with a valid 64-hex key', async () => {
      process.env.DEVICE_TOKEN_ENCRYPTION_KEY = VALID_HEX_KEY;
      const { encryptToken, decryptToken } = await import('@/lib/device-token-crypto');

      const plaintext = 'token-with-explicit-key';
      expect(decryptToken(encryptToken(plaintext))).toBe(plaintext);
    });

    it('should throw when DEVICE_TOKEN_ENCRYPTION_KEY is not 64 hex chars (too short)', async () => {
      process.env.DEVICE_TOKEN_ENCRYPTION_KEY = 'deadbeef'; // Only 4 bytes
      const { encryptToken } = await import('@/lib/device-token-crypto');

      expect(() => encryptToken('any-token')).toThrow(
        'DEVICE_TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)',
      );
    });

    it('should throw when DEVICE_TOKEN_ENCRYPTION_KEY is 63 hex chars (odd length)', async () => {
      process.env.DEVICE_TOKEN_ENCRYPTION_KEY = 'a'.repeat(63);
      const { encryptToken } = await import('@/lib/device-token-crypto');

      // Buffer.from with 'hex' silently drops the last nibble → 31 bytes, not 32
      expect(() => encryptToken('any-token')).toThrow();
    });
  });

  describe('key derivation — SUPABASE_SERVICE_ROLE_KEY fallback', () => {
    it('should derive a key from SUPABASE_SERVICE_ROLE_KEY when explicit key is absent', async () => {
      delete process.env.DEVICE_TOKEN_ENCRYPTION_KEY;
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'super-secret-service-role-key';

      const { encryptToken, decryptToken } = await import('@/lib/device-token-crypto');

      const plaintext = 'token-via-service-role-fallback';
      expect(decryptToken(encryptToken(plaintext))).toBe(plaintext);
    });

    it('should throw when neither env var is set', async () => {
      delete process.env.DEVICE_TOKEN_ENCRYPTION_KEY;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      const { encryptToken } = await import('@/lib/device-token-crypto');

      expect(() => encryptToken('any-token')).toThrow(
        'Neither DEVICE_TOKEN_ENCRYPTION_KEY nor SUPABASE_SERVICE_ROLE_KEY is set',
      );
    });

    it('should produce consistent ciphertext keys from the same service role key', async () => {
      delete process.env.DEVICE_TOKEN_ENCRYPTION_KEY;
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'stable-service-role-key';

      const { encryptToken, decryptToken } = await import('@/lib/device-token-crypto');

      // Encrypt with derived key, decrypt with the same derived key — must succeed
      const plaintext = 'consistency-check-token';
      const encrypted = encryptToken(plaintext);
      expect(decryptToken(encrypted)).toBe(plaintext);
    });
  });

  // ---------------------------------------------------------------------------
  // decryptToken input validation
  // ---------------------------------------------------------------------------
  describe('decryptToken — invalid input', () => {
    it('should throw when input is too short to contain IV + authTag + 1 byte ciphertext', async () => {
      const { decryptToken } = await import('@/lib/device-token-crypto');

      // IV(12) + authTag(16) = 28 bytes minimum + 1 for ciphertext = 29 bytes
      // Encode 10 bytes (below threshold) as base64
      const tooShort = Buffer.alloc(10).toString('base64');

      expect(() => decryptToken(tooShort)).toThrow('Invalid encrypted token: too short');
    });

    it('should throw when given an empty string', async () => {
      const { decryptToken } = await import('@/lib/device-token-crypto');

      expect(() => decryptToken('')).toThrow();
    });

    it('should throw when given a non-base64 garbage string', async () => {
      const { decryptToken } = await import('@/lib/device-token-crypto');

      // Buffer.from with 'base64' silently ignores non-base64 chars; the resulting
      // buffer will likely be too short, triggering the "too short" error.
      expect(() => decryptToken('!!!not-base64!!!')).toThrow();
    });
  });
});
