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
vi.mock('@/utils/env', () => ({
  requireEnv: (key: string) => {
    const map: Record<string, string> = {
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    };
    return map[key] ?? '';
  },
}));

// ─── Supabase mock ────────────────────────────────────────────────────────────
let mockMembershipResult: { data: unknown; error: unknown } = { data: null, error: null };
let mockLogsResult: { data: unknown; error: unknown } = { data: [], error: null };

const mockFrom = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}));

function setupMocks() {
  // org_members query chain: from → select → eq → eq → maybeSingle
  const memberChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(mockMembershipResult),
  };

  // audit_logs query chain: from → select → eq → order → limit
  const logsChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(mockLogsResult),
  };

  mockFrom.mockImplementation((table: string) => {
    if (table === 'organization_members') return memberChain;
    if (table === 'audit_logs') return logsChain;
    return { select: vi.fn().mockReturnThis() };
  });

  return { memberChain, logsChain };
}

import { AuditService } from '@/lib/services/audit-service';

describe('RT-09: AuditService.getOrganizationLogs IDOR fix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMembershipResult = { data: null, error: null };
    mockLogsResult = { data: [], error: null };
  });

  it('throws 403 error when caller is not a member of the org', async () => {
    mockMembershipResult = { data: null, error: null }; // No membership
    setupMocks();

    await expect(AuditService.getOrganizationLogs('org-1', 'attacker-user-id')).rejects.toThrow(
      /Forbidden/,
    );

    const err = await AuditService.getOrganizationLogs('org-1', 'attacker-user-id').catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error & { statusCode?: number }).statusCode).toBe(403);
  });

  it('throws when caller_id is for a different org than requested', async () => {
    // Caller is member of org-2 but requests org-1 logs — membership check fails
    mockMembershipResult = { data: null, error: null };
    setupMocks();

    await expect(AuditService.getOrganizationLogs('org-1', 'user-who-is-in-org-2')).rejects.toThrow(
      /Forbidden/,
    );
  });

  it('returns logs when caller IS a member of the org', async () => {
    mockMembershipResult = { data: { user_id: 'user-1' }, error: null };
    mockLogsResult = {
      data: [
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
          actor: { email: 'user@example.com' },
        },
      ],
      error: null,
    };
    setupMocks();

    const logs = await AuditService.getOrganizationLogs('org-1', 'user-1');
    expect(logs).toHaveLength(1);
    expect(logs[0]?.id).toBe('log-1');
    expect(logs[0]?.actor_email).toBe('user@example.com');
  });

  it('does not return any logs for unauthorized callers (no side channel)', async () => {
    // Even if the DB had logs, an unauthorized caller sees nothing
    mockMembershipResult = { data: null, error: null };
    setupMocks();

    let caughtError: Error | null = null;
    let result: unknown = null;
    try {
      result = await AuditService.getOrganizationLogs('org-1', 'unauthorized-user');
    } catch (e) {
      caughtError = e as Error;
    }

    expect(caughtError).not.toBeNull();
    expect(result).toBeNull();
  });

  it('throws on DB membership error (does not swallow errors)', async () => {
    mockMembershipResult = { data: null, error: new Error('DB connection failed') };
    setupMocks();

    await expect(AuditService.getOrganizationLogs('org-1', 'user-1')).rejects.toThrow();
  });

  it('membership check uses both org_id and user_id as filters', async () => {
    mockMembershipResult = { data: { user_id: 'user-1' }, error: null };
    mockLogsResult = { data: [], error: null };
    const { memberChain } = setupMocks();

    await AuditService.getOrganizationLogs('org-1', 'user-1');

    // Verify eq was called with org constraint AND user constraint
    expect(memberChain.eq).toHaveBeenCalledWith('organization_id', 'org-1');
    expect(memberChain.eq).toHaveBeenCalledWith('user_id', 'user-1');
  });
});
