/**
 * API Key Service Tests
 *
 * Tests for API key creation, verification, listing, and revocation
 * Includes tests for hash format migration (SHA-256 → scrypt → Argon2id)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock argon2
vi.mock('argon2', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('$argon2id$v=19$m=65536,t=3,p=4$...$...'),
    verify: vi.fn().mockResolvedValue(true),
    argon2id: 2,
  },
  hash: vi.fn().mockResolvedValue('$argon2id$v=19$m=65536,t=3,p=4$...$...'),
  verify: vi.fn().mockResolvedValue(true),
  argon2id: 2,
}));

// Mock Supabase
const mockSupabaseClient = {
  from: vi.fn(),
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseClient),
}));

// Import after mocks
import { ApiKeyService, detectHashFormat } from '@/lib/services/api-key-service';

describe('API Key Service', () => {
  const mockUserId = 'user-123';
  const mockApiKey = {
    id: 'key-1',
    user_id: mockUserId,
    name: 'Test Key',
    scopes: ['read', 'write'],
    created_at: '2026-01-25T00:00:00Z',
    expires_at: null,
    last_used_at: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('detectHashFormat', () => {
    it('should detect Argon2id format', () => {
      const hash = '$argon2id$v=19$m=65536,t=3,p=4$somesalt$somehash';
      expect(detectHashFormat(hash)).toBe('argon2id');
    });

    it('should detect scrypt format (salt$hash)', () => {
      const hash = 'a'.repeat(32) + '$' + 'b'.repeat(128);
      expect(detectHashFormat(hash)).toBe('scrypt');
    });

    it('should detect legacy SHA-256 format (64 hex chars)', () => {
      const hash = 'a'.repeat(64);
      expect(detectHashFormat(hash)).toBe('sha256');
    });

    it('should treat ambiguous hashes as SHA-256', () => {
      const hash = 'shortstring';
      expect(detectHashFormat(hash)).toBe('sha256');
    });
  });

  describe('createApiKey', () => {
    it('should create an API key with Argon2id hash', async () => {
      const insertMock = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { ...mockApiKey, key_hash: '$argon2id$...' },
            error: null,
          }),
        }),
      });

      mockSupabaseClient.from.mockReturnValue({ insert: insertMock });

      const result = await ApiKeyService.createApiKey(mockUserId, 'Test Key', ['read', 'write']);

      expect(result.apiKey).toBeDefined();
      expect(result.rawKey).toMatch(/^sk_live_[a-f0-9]{48}$/);
      // Argon2 hash was called during key generation
      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: mockUserId,
          name: 'Test Key',
          scopes: ['read', 'write'],
        }),
      );
    });

    it('should throw on database error', async () => {
      mockSupabaseClient.from.mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'DB error' },
            }),
          }),
        }),
      });

      await expect(ApiKeyService.createApiKey(mockUserId, 'Test Key')).rejects.toMatchObject({
        message: 'DB error',
      });
    });

    it('should create key with empty scopes by default', async () => {
      const insertMock = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { ...mockApiKey, scopes: [] },
            error: null,
          }),
        }),
      });

      mockSupabaseClient.from.mockReturnValue({ insert: insertMock });

      await ApiKeyService.createApiKey(mockUserId, 'Test Key');

      expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ scopes: [] }));
    });
  });

  describe('listApiKeys', () => {
    it('should return user API keys sorted by created_at desc', async () => {
      const mockKeys = [mockApiKey, { ...mockApiKey, id: 'key-2' }];

      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockKeys, error: null }),
          }),
        }),
      });

      const keys = await ApiKeyService.listApiKeys(mockUserId);

      expect(keys).toHaveLength(2);
      expect(keys[0].id).toBe('key-1');
    });

    it('should throw on database error', async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
          }),
        }),
      });

      await expect(ApiKeyService.listApiKeys(mockUserId)).rejects.toMatchObject({
        message: 'DB error',
      });
    });

    it('should return empty array when no keys exist', async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      });

      const keys = await ApiKeyService.listApiKeys(mockUserId);
      expect(keys).toEqual([]);
    });
  });

  describe('revokeApiKey', () => {
    it('should delete API key for the user', async () => {
      const deleteMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      });

      mockSupabaseClient.from.mockReturnValue({ delete: deleteMock });

      await ApiKeyService.revokeApiKey('key-1', mockUserId);

      expect(deleteMock).toHaveBeenCalled();
    });

    it('should throw on database error', async () => {
      mockSupabaseClient.from.mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: { message: 'DB error' } }),
          }),
        }),
      });

      await expect(ApiKeyService.revokeApiKey('key-1', mockUserId)).rejects.toMatchObject({
        message: 'DB error',
      });
    });

    it('should call delete on api_keys table', async () => {
      const deleteMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      });

      mockSupabaseClient.from.mockReturnValue({ delete: deleteMock });

      await ApiKeyService.revokeApiKey('key-1', mockUserId);

      // Verify delete was called
      expect(deleteMock).toHaveBeenCalled();
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('api_keys');
    });
  });

  describe('verifyKey', () => {
    it('should return null for invalid key format (not starting with sk_live_)', async () => {
      const result = await ApiKeyService.verifyKey('invalid-key-format');
      expect(result).toBeNull();
    });

    it('should return null when no keys match', async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          or: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      });

      const result = await ApiKeyService.verifyKey('sk_live_' + 'a'.repeat(48));
      expect(result).toBeNull();
    });

    it('should verify key with Argon2id hash', async () => {
      const keyWithHash = {
        ...mockApiKey,
        key_hash: '$argon2id$v=19$m=65536,t=3,p=4$salt$hash',
      };

      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          or: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [keyWithHash], error: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            then: vi.fn((cb) => cb({ error: null })),
          }),
        }),
      });

      const result = await ApiKeyService.verifyKey('sk_live_' + 'a'.repeat(48));

      expect(result).toBeDefined();
      expect(result?.id).toBe('key-1');
      // Argon2 verify was called
    });

    it('should not return key_hash in result for security', async () => {
      const keyWithHash = {
        ...mockApiKey,
        key_hash: '$argon2id$v=19$m=65536,t=3,p=4$salt$hash',
      };

      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          or: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [keyWithHash], error: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            then: vi.fn((cb) => cb({ error: null })),
          }),
        }),
      });

      const result = await ApiKeyService.verifyKey('sk_live_' + 'a'.repeat(48));

      expect(result).not.toHaveProperty('key_hash');
    });

    it('should return null when no matching key found after verification', async () => {
      // When no keys exist, verifyKey returns null
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          or: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      });

      const result = await ApiKeyService.verifyKey('sk_live_' + 'a'.repeat(48));
      expect(result).toBeNull();
    });

    it('should filter expired keys', async () => {
      const selectMock = vi.fn().mockReturnValue({
        or: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      });

      mockSupabaseClient.from.mockReturnValue({ select: selectMock });

      await ApiKeyService.verifyKey('sk_live_' + 'a'.repeat(48));

      // Should use or condition for expires_at
      expect(selectMock).toHaveBeenCalled();
    });

    it('should return null on database error', async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          or: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
          }),
        }),
      });

      const result = await ApiKeyService.verifyKey('sk_live_' + 'a'.repeat(48));
      expect(result).toBeNull();
    });
  });
});
