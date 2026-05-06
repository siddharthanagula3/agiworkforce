/**
 * RT-02: API key DoS via Argon2 scan
 *
 * Tests that:
 * - Garbage keys are rejected immediately (no Argon2 work)
 * - New keys (with key_id prefix) use single-row DB lookup
 * - Legacy keys go through the slow path but are still rejected for wrong format
 * - Format regex works correctly
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/utils/env', () => ({
  requireEnv: (key: string) => {
    const map: Record<string, string> = {
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    };
    return map[key] ?? '';
  },
}));

// ─── Argon2 mock — track call count ──────────────────────────────────────────
const mockArgon2Verify = vi.fn();
const mockArgon2Hash = vi.fn().mockResolvedValue('$argon2id$mocked-hash');
vi.mock('argon2', () => ({
  default: {
    verify: (...args: unknown[]) => mockArgon2Verify(...args),
    hash: (...args: unknown[]) => mockArgon2Hash(...args),
    argon2id: 2,
  },
}));

// ─── Supabase mock ────────────────────────────────────────────────────────────
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockIs = vi.fn();
const mockOr = vi.fn();
const mockLimit = vi.fn();
const mockMaybeSingle = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockThen = vi.fn().mockResolvedValue({ error: null });

const mockFrom = vi.fn().mockReturnValue({
  select: mockSelect,
  insert: mockInsert,
});

mockSelect.mockReturnValue({
  eq: mockEq,
  is: mockIs,
  or: mockOr,
});
mockEq.mockReturnValue({ or: mockOr, maybeSingle: mockMaybeSingle, limit: mockLimit, eq: mockEq });
mockIs.mockReturnValue({ or: mockOr });
mockOr.mockReturnValue({ limit: mockLimit });
mockLimit.mockReturnValue([]);
mockInsert.mockReturnValue({ select: mockSelect });

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
    auth: { getUser: vi.fn() },
  })),
}));

import { ApiKeyService, KEY_ID_REGEX } from '@/lib/services/api-key-service';

describe('RT-02: API key DoS fix — fast verify path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockArgon2Verify.mockResolvedValue(false);
    mockFrom.mockReturnValue({ select: mockSelect, insert: mockInsert });
    mockSelect.mockReturnValue({ eq: mockEq, is: mockIs, or: mockOr });
    mockEq.mockReturnValue({
      or: mockOr,
      maybeSingle: mockMaybeSingle,
      limit: mockLimit,
      eq: mockEq,
    });
    mockIs.mockReturnValue({ or: mockOr });
    mockOr.mockReturnValue({ limit: mockLimit });
    mockLimit.mockResolvedValue({ data: [], error: null });
  });

  describe('KEY_ID_REGEX format validation', () => {
    it('matches new key format with 16-char hex keyId', () => {
      const key = 'sk_live_1a2b3c4d5e6f7890_someSecret';
      expect(KEY_ID_REGEX.test(key)).toBe(true);
      const match = KEY_ID_REGEX.exec(key);
      expect(match?.[1]).toBe('1a2b3c4d5e6f7890');
    });

    it('does not match old key format (no underscore separator after prefix)', () => {
      const key = 'sk_live_API_KEY_TEST_OLD_FORMAT_REDACTED';
      // Old format: no second underscore after the 8-hex keyId segment
      expect(KEY_ID_REGEX.test(key)).toBe(false);
    });

    it('does not match garbage', () => {
      expect(KEY_ID_REGEX.test('garbage')).toBe(false);
      expect(KEY_ID_REGEX.test('Bearer token')).toBe(false);
    });
  });

  describe('verifyKey: parse-time rejection', () => {
    it('returns null immediately for garbage keys — no Argon2 call', async () => {
      const result = await ApiKeyService.verifyKey('garbage-not-a-key');
      expect(result).toBeNull();
      expect(mockArgon2Verify).not.toHaveBeenCalled();
    });

    it('returns null immediately for keys too short', async () => {
      const result = await ApiKeyService.verifyKey('sk_live_tooshort');
      expect(result).toBeNull();
      expect(mockArgon2Verify).not.toHaveBeenCalled();
    });

    it('returns null immediately for empty string', async () => {
      const result = await ApiKeyService.verifyKey('');
      expect(result).toBeNull();
      expect(mockArgon2Verify).not.toHaveBeenCalled();
    });
  });

  describe('verifyKey: fast path (new format with key_id)', () => {
    it('does single DB lookup by key_prefix for new-format keys', async () => {
      const keyId = '1a2b3c4d5e6f7890';
      const rawKey = `sk_live_${keyId}_someSecretValue`;

      // Mock: no matching key found (invalid key)
      mockLimit.mockResolvedValue({ data: [], error: null });

      const result = await ApiKeyService.verifyKey(rawKey);
      expect(result).toBeNull();

      // Should have called from('api_keys') and used eq('key_prefix', keyId)
      expect(mockFrom).toHaveBeenCalledWith('api_keys');
      expect(mockEq).toHaveBeenCalledWith('key_prefix', keyId);
      // Should NOT have run Argon2 (no matching key)
      expect(mockArgon2Verify).not.toHaveBeenCalled();
    });

    it('runs Argon2 exactly once when key_prefix matches', async () => {
      const keyId = '1a2b3c4d5e6f7890';
      const rawKey = `sk_live_${keyId}_someSecretValue`;
      const storedHash = '$argon2id$v=19$m=65536,t=3,p=4$fakehash';

      // Mock: found a matching key
      mockLimit.mockResolvedValue({
        data: [
          {
            id: 'key-1',
            user_id: 'user-123',
            name: 'My Key',
            key_hash: storedHash,
            key_prefix: keyId,
            scopes: [],
            created_at: '2026-01-01',
            expires_at: null,
            last_used_at: null,
          },
        ],
        error: null,
      });
      mockArgon2Verify.mockResolvedValue(true);

      // Mock the update call for last_used_at
      mockFrom.mockReturnValue({
        select: mockSelect,
        insert: mockInsert,
        update: mockUpdate,
      });
      mockUpdate.mockReturnValue({ eq: vi.fn().mockReturnValue({ then: mockThen }) });

      const result = await ApiKeyService.verifyKey(rawKey);
      expect(result).not.toBeNull();
      expect(result?.id).toBe('key-1');
      // Exactly one Argon2 verify call
      expect(mockArgon2Verify).toHaveBeenCalledOnce();
      expect(mockArgon2Verify).toHaveBeenCalledWith(storedHash, rawKey);
    });

    it('returns null when Argon2 verify fails for matching key_prefix', async () => {
      const keyId = '1a2b3c4d5e6f7890';
      const rawKey = `sk_live_${keyId}_wrongSecret`;

      mockLimit.mockResolvedValue({
        data: [
          {
            id: 'key-1',
            user_id: 'user-123',
            name: 'My Key',
            key_hash: '$argon2id$v=19$m=65536,t=3,p=4$fakehash',
            key_prefix: keyId,
            scopes: [],
            created_at: '2026-01-01',
            expires_at: null,
            last_used_at: null,
          },
        ],
        error: null,
      });
      mockArgon2Verify.mockResolvedValue(false);

      const result = await ApiKeyService.verifyKey(rawKey);
      expect(result).toBeNull();
      // Only one Argon2 call — no fan-out
      expect(mockArgon2Verify).toHaveBeenCalledOnce();
    });
  });

  describe('verifyKey: does NOT return key_hash in result', () => {
    it('strips key_hash and key_prefix from returned object', async () => {
      const keyId = '1a2b3c4d5e6f7890';
      const rawKey = `sk_live_${keyId}_someSecretValue`;
      const storedHash = '$argon2id$v=19$m=65536,t=3,p=4$fakehash';

      mockLimit.mockResolvedValue({
        data: [
          {
            id: 'key-1',
            user_id: 'user-123',
            name: 'My Key',
            key_hash: storedHash,
            key_prefix: keyId,
            scopes: [],
            created_at: '2026-01-01',
            expires_at: null,
            last_used_at: null,
          },
        ],
        error: null,
      });
      mockArgon2Verify.mockResolvedValue(true);
      mockFrom.mockReturnValue({
        select: mockSelect,
        insert: mockInsert,
        update: mockUpdate,
      });
      mockUpdate.mockReturnValue({ eq: vi.fn().mockReturnValue({ then: mockThen }) });

      const result = await ApiKeyService.verifyKey(rawKey);
      expect(result).not.toBeNull();
      expect((result as unknown as Record<string, unknown>)['key_hash']).toBeUndefined();
      expect((result as unknown as Record<string, unknown>)['key_prefix']).toBeUndefined();
    });
  });
});
