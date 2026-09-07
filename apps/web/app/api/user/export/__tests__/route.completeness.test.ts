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
    (handler: (request: NextRequest) => Promise<Response>) => (request: NextRequest) =>
      handler(request),
}));
vi.mock('@/lib/cors', () => ({
  withCorsRoute: (handler: (request: NextRequest) => Promise<Response>) => handler,
  handleCorsPreflightRequest: () => null,
  getCorsHeaders: () => ({}),
  getSecurityHeaders: () => ({}),
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
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

function exportRequest(url = 'https://agiworkforce.com/api/user/export'): NextRequest {
  return new NextRequest(url);
}

describe('GET /api/user/export completeness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClerkAuthUser.mockResolvedValue({ userId: 'user_export', email: 'user@example.com' });
    mockQuery.mockResolvedValue([]);
  });

  it('reports a complete export when every section was read', async () => {
    const response = await GET(exportRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.status).toBe('complete');
    expect(body.data.export_metadata.completeness).toMatchObject({
      status: 'complete',
      unavailable_sections: [],
      skipped_rows: [],
    });
  });

  it('marks the export partial and names the section when a read fails', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('from web_conversations')) throw new Error('relation is being rebuilt');
      return [];
    });

    const response = await GET(exportRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(false);
    expect(body.status).toBe('partial');
    expect(body.data.export_metadata.completeness.unavailable_sections).toEqual(['conversations']);
    expect(body.data.export_metadata.completeness.retry).toMatch(/again/i);
  });

  it('counts rows it had to skip instead of pretending they were exported', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('from user_memories')) return [{ id: 42, content: null }];
      return [];
    });

    const response = await GET(exportRequest());
    const body = await response.json();

    expect(body.status).toBe('partial');
    expect(body.data.export_metadata.completeness.skipped_rows).toEqual([
      { section: 'memories', count: 1 },
    ]);
  });

  it('stamps the download variant with the same status header', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('from web_conversations')) throw new Error('unavailable');
      return [];
    });

    const response = await GET(
      exportRequest('https://agiworkforce.com/api/user/export?download=true'),
    );

    expect(response.headers.get('X-Export-Status')).toBe('partial');
    const body = JSON.parse(await response.text());
    expect(body.export_metadata.completeness.status).toBe('partial');
  });
});
