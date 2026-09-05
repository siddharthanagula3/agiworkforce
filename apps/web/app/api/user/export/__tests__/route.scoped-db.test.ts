import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const { mockQuery, mockExecute, mockGetClerkAuthUser } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockExecute: vi.fn(),
  mockGetClerkAuthUser: vi.fn(),
}));

vi.mock('@/lib/error-handler', () => ({
  withErrorHandler:
    (handler: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      handler(...args),
}));

vi.mock('@/lib/cors', () => ({
  getSecurityHeaders: vi.fn(() => ({})),
  getCorsHeaders: vi.fn(() => ({})),
  handleCorsPreflightRequest: vi.fn(() => null),
  withCorsRoute:
    (handler: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      handler(...args),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: (...args: unknown[]) => mockGetClerkAuthUser(...args),
}));

vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: vi.fn(async () => undefined),
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(),
}));

vi.mock('@/lib/services/billing-invoice-service', () => ({
  listUserBillingInvoices: vi.fn(async () => []),
}));

vi.mock('@/lib/services/managed-usage-summary-service', () => ({
  getManagedUsageSummary: vi.fn(async () => ({})),
}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mockQuery(...args),
    execute: (...args: unknown[]) => mockExecute(...args),
    transaction: async (callback: (tx: unknown) => unknown) =>
      callback({
        query: (...args: unknown[]) => mockQuery(...args),
        execute: (...args: unknown[]) => mockExecute(...args),
      }),
  })),
}));

import { GET } from '../route';

function exportRequest(url = 'https://agiworkforce.com/api/user/export'): NextRequest {
  return new NextRequest(url);
}

describe('GET /api/user/export scoped db binding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClerkAuthUser.mockResolvedValue({ userId: 'user_export', email: 'user@example.com' });
    mockQuery.mockResolvedValue([]);
  });

  it('binds every export read to the claimed session scope', async () => {
    const response = await GET(exportRequest());

    expect(response.status).toBe(200);
    expect(mockExecute).toHaveBeenCalledWith('set local role app_rls');
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("set_config('request.jwt.claim.sub', $1, true)"),
      ['user_export', ''],
    );
  });

  it('exports the workspace rows a member owns, not only their personal ones', async () => {
    const ORGANIZATION = '11111111-1111-4111-8111-111111111111';
    let boundOrganizationId = '';
    mockQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (sql.includes("set_config('request.jwt.claim.org_id'")) {
        boundOrganizationId = String(params[1] ?? '');
        return [];
      }
      if (sql.includes('from organization_members')) {
        return [
          {
            organization_id: ORGANIZATION,
            role: 'member',
            provisioning_source: null,
            provisioned_at: null,
            joined_at: '2026-01-01T00:00:00.000Z',
          },
        ];
      }
      // The tenant predicate only returns a workspace row while the session is
      // bound to that workspace, which is exactly what the bug missed.
      if (sql.includes('from web_conversations') && boundOrganizationId === ORGANIZATION) {
        return [
          {
            id: 'conversation-in-workspace',
            title: 'Workspace thread',
            model: 'test-model',
            project_id: null,
            pinned: false,
            created_at: '2026-02-01T00:00:00.000Z',
            updated_at: '2026-02-01T00:00:00.000Z',
            deleted_at: null,
          },
        ];
      }
      return [];
    });

    const response = await GET(exportRequest());
    const body = (await response.json()) as {
      data: { conversations: { id: string }[] };
    };

    expect(response.status).toBe(200);
    expect(body.data.conversations.map((conversation) => conversation.id)).toContain(
      'conversation-in-workspace',
    );
  });

  it('ignores an identity smuggled into the query string and exports the session user only', async () => {
    const response = await GET(
      exportRequest('https://agiworkforce.com/api/user/export?userId=victim-user'),
    );
    const body = (await response.json()) as { user_id: string };

    expect(response.status).toBe(200);
    expect(body.user_id).toBe('user_export');
    expect(
      mockQuery.mock.calls.some(
        ([, params]) => Array.isArray(params) && params.includes('victim-user'),
      ),
    ).toBe(false);
  });
});
