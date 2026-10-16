import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  DataExportArchiveResponseSchema,
  type DataExportArchive,
  type DataExportDelivery,
} from '@agiworkforce/cloud-contracts';

vi.mock('server-only', () => ({}));

type DataExportArchiveModule = typeof import('@/lib/server/data-export-archive');
type ErrorHandlerModule = typeof import('@/lib/error-handler');
type CorsModule = typeof import('@/lib/cors');
type RateLimitModule = typeof import('@/lib/rate-limit');
type LoggerModule = typeof import('@/lib/logger');
type ApiAuthModule = typeof import('@/lib/api-auth');
type CsrfModule = typeof import('@/lib/csrf');
type SecurityAuditModule = typeof import('@/lib/security-audit');
type NeonDbModule = typeof import('@/lib/server/neon-db');

const mocks = vi.hoisted(() => ({
  getClerkAuthUser: vi.fn(),
  requestDataExportArchive: vi.fn(),
  recordAuditEvent: vi.fn(async () => undefined),
  requireCsrfToken: vi.fn(async () => null),
}));

vi.mock('@/lib/error-handler', async (importOriginal) => ({
  ...(await importOriginal<ErrorHandlerModule>()),
  withErrorHandler:
    (handler: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      handler(...args),
}));

vi.mock('@/lib/cors', async (importOriginal) => ({
  ...(await importOriginal<CorsModule>()),
  getSecurityHeaders: vi.fn(() => ({})),
  getCorsHeaders: vi.fn(() => ({})),
  handleCorsPreflightRequest: vi.fn(() => null),
  withCorsRoute:
    (handler: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      handler(...args),
}));

vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<RateLimitModule>()),
  withRateLimit: vi.fn(async () => null),
}));

vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/api-auth', async (importOriginal) => ({
  ...(await importOriginal<ApiAuthModule>()),
  getClerkAuthUser: (...args: unknown[]) => mocks.getClerkAuthUser(...args),
}));

vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<CsrfModule>()),
  requireCsrfToken: mocks.requireCsrfToken,
}));

vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<SecurityAuditModule>()),
  recordAuditEvent: mocks.recordAuditEvent,
}));

vi.mock('@/lib/services/billing-invoice-service', () => ({
  listUserBillingInvoices: vi.fn(async () => []),
}));

vi.mock('@/lib/services/managed-usage-summary-service', () => ({
  getManagedUsageSummary: vi.fn(async () => ({})),
}));

vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<NeonDbModule>()),
  getNeonDb: vi.fn(() => ({ query: vi.fn(async () => []), execute: vi.fn() })),
}));

vi.mock('@/lib/server/data-export-archive', async (importOriginal) => ({
  ...(await importOriginal<DataExportArchiveModule>()),
  requestDataExportArchive: mocks.requestDataExportArchive,
}));

import { POST } from '../route';

function preparing(delivery: DataExportDelivery): DataExportArchive {
  return {
    id: 'export-1',
    status: 'preparing',
    delivery,
    requestedAt: '2026-10-16T10:00:00.000Z',
    readyAt: null,
    expiresAt: null,
    volumes: [],
  };
}

function exportRequest(): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/user/export', { method: 'POST' });
}

describe('POST /api/user/export says how the export will be delivered', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getClerkAuthUser.mockResolvedValue({ userId: 'user_export', email: 'u@example.com' });
  });

  it.each(['email', 'in_app'] as const)(
    'answers 202 with a contract-valid archive whose delivery is %s',
    async (delivery) => {
      mocks.requestDataExportArchive.mockResolvedValue({
        archive: preparing(delivery),
        created: true,
      });

      const response = await POST(exportRequest());

      expect(response.status).toBe(202);
      const body = DataExportArchiveResponseSchema.parse(await response.json());
      expect(body.archive).toMatchObject({ status: 'preparing', delivery });
      expect(response.headers.get('cache-control')).toBe('private, no-store');
    },
  );

  it('rejects a body that leaves delivery out', () => {
    const { delivery: _omitted, ...withoutDelivery } = preparing('email');

    expect(DataExportArchiveResponseSchema.safeParse({ archive: withoutDelivery }).success).toBe(
      false,
    );
  });
});
