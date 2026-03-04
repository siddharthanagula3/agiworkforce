/**
 * Audit Service Tests
 *
 * Tests for audit logging and retrieval
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

// Mock Supabase
const mockSupabaseClient = {
  from: vi.fn(),
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseClient),
}));

// Import after mocks
import { AuditService } from '@/lib/services/audit-service';
import { logger } from '@/lib/logger';

describe('Audit Service', () => {
  const mockUserId = 'user-123';
  const mockOrgId = 'org-456';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('log', () => {
    it('should insert audit log entry', async () => {
      const insertMock = vi.fn().mockResolvedValue({ error: null });
      mockSupabaseClient.from.mockReturnValue({ insert: insertMock });

      await AuditService.log(
        'api_key.created',
        'api_key',
        'key-123',
        { name: 'My API Key' },
        {
          userId: mockUserId,
          orgId: mockOrgId,
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
        },
      );

      expect(insertMock).toHaveBeenCalledWith({
        action: 'api_key.created',
        resource: 'api_key',
        resource_id: 'key-123',
        metadata: { name: 'My API Key' },
        user_id: mockUserId,
        organization_id: mockOrgId,
        ip_address: '192.168.1.1',
        user_agent: 'Mozilla/5.0',
      });
    });

    it('should handle missing optional context fields', async () => {
      const insertMock = vi.fn().mockResolvedValue({ error: null });
      mockSupabaseClient.from.mockReturnValue({ insert: insertMock });

      await AuditService.log('user.login', 'user', 'user-123', {}, {});

      expect(insertMock).toHaveBeenCalledWith({
        action: 'user.login',
        resource: 'user',
        resource_id: 'user-123',
        metadata: {},
        user_id: undefined,
        organization_id: undefined,
        ip_address: undefined,
        user_agent: undefined,
      });
    });

    it('should not throw on database error (logs error instead)', async () => {
      mockSupabaseClient.from.mockReturnValue({
        insert: vi.fn().mockResolvedValue({ error: { message: 'DB error' } }),
      });

      // Should not throw
      await expect(
        AuditService.log('test.action', 'test', 'id-123', {}, {}),
      ).resolves.toBeUndefined();

      // Should log the error
      expect(logger.error).toHaveBeenCalled();
    });

    it('should include empty object metadata by default', async () => {
      const insertMock = vi.fn().mockResolvedValue({ error: null });
      mockSupabaseClient.from.mockReturnValue({ insert: insertMock });

      // When called with default empty object for metadata
      await AuditService.log('test.action', 'test', 'id-123', {}, {});

      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: {},
        }),
      );
    });

    it('should log complex metadata objects', async () => {
      const insertMock = vi.fn().mockResolvedValue({ error: null });
      mockSupabaseClient.from.mockReturnValue({ insert: insertMock });

      const complexMetadata = {
        changes: {
          old: { status: 'pending' },
          new: { status: 'approved' },
        },
        affectedCount: 5,
        tags: ['important', 'billing'],
      };

      await AuditService.log('subscription.updated', 'subscription', 'sub-123', complexMetadata, {
        userId: mockUserId,
      });

      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: complexMetadata,
        }),
      );
    });
  });

  describe('getOrganizationLogs', () => {
    const mockLogs = [
      {
        id: 'log-1',
        action: 'api_key.created',
        resource: 'api_key',
        resource_id: 'key-123',
        metadata: {},
        user_id: mockUserId,
        organization_id: mockOrgId,
        ip_address: '192.168.1.1',
        user_agent: 'Mozilla/5.0',
        created_at: '2026-01-25T10:00:00Z',
        actor: { email: 'user@example.com' },
      },
      {
        id: 'log-2',
        action: 'user.login',
        resource: 'user',
        resource_id: 'user-456',
        metadata: { method: 'oauth' },
        user_id: 'user-456',
        organization_id: mockOrgId,
        ip_address: '192.168.1.2',
        user_agent: 'Chrome/100',
        created_at: '2026-01-25T09:00:00Z',
        actor: { email: 'other@example.com' },
      },
    ];

    it('should return organization logs with actor email', async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: mockLogs, error: null }),
            }),
          }),
        }),
      });

      const logs = await AuditService.getOrganizationLogs(mockOrgId);

      expect(logs).toHaveLength(2);
      expect(logs[0]!.actor_email).toBe('user@example.com');
      expect(logs[1]!.actor_email).toBe('other@example.com');
    });

    it('should use default limit of 50', async () => {
      const limitMock = vi.fn().mockResolvedValue({ data: [], error: null });
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: limitMock,
            }),
          }),
        }),
      });

      await AuditService.getOrganizationLogs(mockOrgId);

      expect(limitMock).toHaveBeenCalledWith(50);
    });

    it('should respect custom limit parameter', async () => {
      const limitMock = vi.fn().mockResolvedValue({ data: [], error: null });
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: limitMock,
            }),
          }),
        }),
      });

      await AuditService.getOrganizationLogs(mockOrgId, 100);

      expect(limitMock).toHaveBeenCalledWith(100);
    });

    it('should order by created_at descending', async () => {
      const orderMock = vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      });
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: orderMock,
          }),
        }),
      });

      await AuditService.getOrganizationLogs(mockOrgId);

      expect(orderMock).toHaveBeenCalledWith('created_at', { ascending: false });
    });

    it('should throw on database error', async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
            }),
          }),
        }),
      });

      await expect(AuditService.getOrganizationLogs(mockOrgId)).rejects.toMatchObject({
        message: 'DB error',
      });
    });

    it('should handle null actor (user deleted)', async () => {
      const logsWithNullActor = [
        {
          ...mockLogs[0],
          actor: null,
        },
      ];

      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: logsWithNullActor, error: null }),
            }),
          }),
        }),
      });

      const logs = await AuditService.getOrganizationLogs(mockOrgId);

      expect(logs[0]!.actor_email).toBeUndefined();
    });
  });
});
