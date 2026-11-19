import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type IdentityModule = typeof import('@/lib/server/identity');
type ErrorHandlerModule = typeof import('@/lib/error-handler');
type CorsModule = typeof import('@/lib/cors');
type RateLimitModule = typeof import('@/lib/rate-limit');
type LoggerModule = typeof import('@/lib/logger');
type ApiAuthModule = typeof import('@/lib/api-auth');
type SecurityAuditModule = typeof import('@/lib/security-audit');
type NeonDbModule = typeof import('@/lib/server/neon-db');

vi.mock('server-only', () => ({}));

const { mockQuery, mockExecute, mockGetClerkAuthUser, mockInvoicePage, mockGetIdentityUser } =
  vi.hoisted(() => ({
    mockQuery: vi.fn(),
    mockExecute: vi.fn(),
    mockGetClerkAuthUser: vi.fn(),
    mockInvoicePage: vi.fn(),
    mockGetIdentityUser: vi.fn(),
  }));

vi.mock('@/lib/server/identity', async (importOriginal) => ({
  ...(await importOriginal<IdentityModule>()),
  getIdentityProvider: vi.fn(),
  getIdentityUser: (...args: unknown[]) => mockGetIdentityUser(...args),
  getRequestIdentity: vi.fn(),
}));

vi.mock('@/lib/error-handler', async (importOriginal) => ({
  ...(await importOriginal<ErrorHandlerModule>()),
  withErrorHandler:
    (handler: (request: NextRequest) => Promise<Response>) => (request: NextRequest) =>
      handler(request),
}));
vi.mock('@/lib/cors', async (importOriginal) => ({
  ...(await importOriginal<CorsModule>()),
  withCorsRoute: (handler: (request: NextRequest) => Promise<Response>) => handler,
  handleCorsPreflightRequest: () => null,
  getCorsHeaders: () => ({}),
  getSecurityHeaders: () => ({}),
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<RateLimitModule>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/api-auth', async (importOriginal) => ({
  ...(await importOriginal<ApiAuthModule>()),
  getClerkAuthUser: (...args: unknown[]) => mockGetClerkAuthUser(...args),
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<SecurityAuditModule>()),
  recordAuditEvent: vi.fn(async () => undefined),
  BLOCK_APPEAL_PATH: '/support',
  logAuthFailure: vi.fn(async () => undefined),
  logRateLimitExceeded: vi.fn(),
}));
vi.mock('@/lib/services/billing-invoice-service', () => ({
  BILLING_INVOICE_PAGE_LIMIT: 24,
  listUserBillingInvoices: vi.fn(async () => []),
  readUserBillingInvoicePage: mockInvoicePage,
}));
vi.mock('@/lib/services/managed-usage-summary-service', () => ({
  getManagedUsageSummary: vi.fn(async () => ({})),
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<NeonDbModule>()),
  getNeonDb: () => ({
    query: (...args: unknown[]) => mockQuery(...args),
    execute: (...args: unknown[]) => mockExecute(...args),
    transaction: async (run: (tx: unknown) => Promise<unknown>) =>
      run({
        query: (...args: unknown[]) => mockQuery(...args),
        execute: (...args: unknown[]) => mockExecute(...args),
      }),
  }),
}));

import { GET } from '../route';

function exportRequest(): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/user/export');
}

describe('GET /api/user/export account email', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClerkAuthUser.mockResolvedValue({ userId: 'user_export' });
    mockQuery.mockReset().mockResolvedValue([]);
    mockGetIdentityUser.mockReset();
    mockInvoicePage.mockReset().mockResolvedValue({
      invoices: [],
      available: true,
      hasMore: false,
      truncatedLineItems: [],
    });
  });

  it('exports the account primary email when the session token carries none', async () => {
    mockGetIdentityUser.mockResolvedValue({
      primaryEmail: 'phone@example.com',
      primaryEmailVerification: 'unverified',
    });

    const body = await (await GET(exportRequest())).json();

    expect(mockGetIdentityUser).toHaveBeenCalledWith('user_export');
    expect(body.data.account).toEqual({ id: 'user_export', email: 'phone@example.com' });
    expect(body.data.export_metadata.completeness.status).toBe('complete');
  });

  it('uses the email the token carries without a second lookup', async () => {
    mockGetClerkAuthUser.mockResolvedValue({ userId: 'user_export', email: 'token@example.com' });

    const body = await (await GET(exportRequest())).json();

    expect(mockGetIdentityUser).not.toHaveBeenCalled();
    expect(body.data.account.email).toBe('token@example.com');
  });

  it('marks the account section unavailable instead of claiming a complete export', async () => {
    mockGetIdentityUser.mockRejectedValue(new Error('identity provider down'));

    const response = await GET(exportRequest());
    const body = await response.json();

    expect(body.data.account.email).toBeUndefined();
    expect(response.headers.get('X-Export-Status')).toBe('partial');
    expect(body.data.export_metadata.completeness.unavailable_sections).toEqual(['account']);
  });
});
