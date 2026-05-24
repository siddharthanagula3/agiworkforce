/**
 * RT-09: AuditService.getOrganizationLogs — IDOR via missing membership check
 *
 * Tests that getOrganizationLogs:
 * - Requires callerUserId parameter
 * - Rejects callers who are not org members (throws 403-shaped error)
 * - Returns logs when caller IS a member
 * - Does not leak email addresses of non-members to unauthorized callers
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// ─── Neon DB mock ─────────────────────────────────────────────────────────────
// AuditService.getOrganizationLogs accepts a DatabaseAdapter and calls
// db.query(sql, params) twice: once for membership check, once for audit logs.
// We control per-test behavior by setting mockMembershipRows / mockLogsRows.

let mockMembershipRows: unknown[] = [];
let mockLogsRows: unknown[] = [];
let mockMembershipThrows: unknown = null;

const mockQuery = vi.fn();

// Mock client passed explicitly to getOrganizationLogs.
const mockClient = {
  query: mockQuery,
} as unknown as import('@agiworkforce/data-layer').DatabaseAdapter;

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: mockQuery,
    execute: vi.fn().mockResolvedValue(1),
    transaction: vi.fn((fn: (db: unknown) => unknown) => fn({})),
    withUser: vi.fn(() => ({})),
    dispose: vi.fn(),
  })),
}));

function setupMocks() {
  mockQuery.mockImplementation((sql: string) => {
    if (sql.includes('organization_members')) {
      if (mockMembershipThrows) return Promise.reject(mockMembershipThrows);
      return Promise.resolve(mockMembershipRows);
    }
    if (sql.includes('audit_logs')) {
      return Promise.resolve(mockLogsRows);
    }
    return Promise.resolve([]);
  });
}

import { AuditService } from '@/lib/services/audit-service';

describe('RT-09: AuditService.getOrganizationLogs IDOR fix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMembershipRows = [];
    mockLogsRows = [];
    mockMembershipThrows = null;
  });

  it('throws 403 error when caller is not a member of the org', async () => {
    mockMembershipRows = []; // No membership row returned
    setupMocks();

    await expect(
      AuditService.getOrganizationLogs(mockClient, 'org-1', 'attacker-user-id'),
    ).rejects.toMatchObject({ message: expect.stringContaining('Forbidden') });

    const err = await AuditService.getOrganizationLogs(
      mockClient,
      'org-1',
      'attacker-user-id',
    ).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error & { statusCode?: number }).statusCode).toBe(403);
  });

  it('throws when caller_id is for a different org than requested', async () => {
    // Caller is member of org-2 but requests org-1 logs — membership check returns no row
    mockMembershipRows = [];
    setupMocks();

    await expect(
      AuditService.getOrganizationLogs(mockClient, 'org-1', 'user-who-is-in-org-2'),
    ).rejects.toMatchObject({ message: expect.stringContaining('Forbidden') });
  });

  it('returns logs when caller IS a member of the org', async () => {
    mockMembershipRows = [{ user_id: 'user-1' }];
    mockLogsRows = [
      {
        id: 'log-1',
        action: 'create',
        resource: 'chat',
        resource_id: 'chat-1',
        metadata: {},
        user_id: 'user-1',
        organization_id: 'org-1',
        ip_address: '1.2.3.4',
        user_agent: 'Mozilla/5.0',
        created_at: '2026-01-01T00:00:00Z',
        actor_email: 'user@example.com',
      },
    ];
    setupMocks();

    const logs = await AuditService.getOrganizationLogs(mockClient, 'org-1', 'user-1');
    expect(logs).toHaveLength(1);
    expect(logs[0]?.id).toBe('log-1');
    expect(logs[0]?.actor_email).toBe('user@example.com');
  });

  it('does not return any logs for unauthorized callers (no side channel)', async () => {
    // Even if the DB had logs, an unauthorized caller sees nothing
    mockMembershipRows = [];
    setupMocks();

    let caughtError: Error | null = null;
    let result: unknown = null;
    try {
      result = await AuditService.getOrganizationLogs(mockClient, 'org-1', 'unauthorized-user');
    } catch (e) {
      caughtError = e as Error;
    }

    expect(caughtError).not.toBeNull();
    expect(result).toBeNull();
  });

  it('throws on DB membership error (does not swallow errors)', async () => {
    mockMembershipThrows = new Error('DB connection failed');
    setupMocks();

    await expect(AuditService.getOrganizationLogs(mockClient, 'org-1', 'user-1')).rejects.toThrow();
  });

  it('membership check uses both org_id and user_id as filters', async () => {
    mockMembershipRows = [{ user_id: 'user-1' }];
    mockLogsRows = [];
    setupMocks();

    await AuditService.getOrganizationLogs(mockClient, 'org-1', 'user-1');

    // Verify db.query was called with both org and user params
    const membershipCall = mockQuery.mock.calls.find(
      (args: unknown[]) => typeof args[0] === 'string' && args[0].includes('organization_members'),
    ) as [string, unknown[]] | undefined;
    expect(membershipCall).toBeDefined();
    const params = membershipCall![1];
    expect(params).toContain('org-1');
    expect(params).toContain('user-1');
  });
});
