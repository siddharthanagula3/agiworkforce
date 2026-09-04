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

vi.mock('@/lib/security-audit', () => ({ recordAuditEvent: vi.fn(async () => undefined) }));

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
