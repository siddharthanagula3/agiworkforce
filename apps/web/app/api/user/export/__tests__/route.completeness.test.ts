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
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: vi.fn(async () => undefined),
  BLOCK_APPEAL_PATH: '/support',
  logAuthFailure: vi.fn(async () => undefined),
  logRateLimitExceeded: vi.fn(),
}));
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

  it('says a capped section is truncated instead of calling the export complete', async () => {
    // The two highest-cardinality sections are capped so the download stays
    // usable. Reporting 'complete' while holding only the most recent rows is
    // the one claim an access request must not make loosely.
    mockQuery.mockImplementation(async (sql: unknown) =>
      String(sql).includes('security_audit_logs')
        ? Array.from({ length: 1000 }, (_, index) => ({
            id: `evt-${index}`,
            event_type: 'login',
            severity: 'info',
            ip_address: null,
            user_agent: null,
            endpoint: null,
            created_at: '2026-09-01T00:00:00.000Z',
          }))
        : [],
    );

    const body = await (await GET(exportRequest())).json();

    expect(body.data.export_metadata.completeness.status).toBe('partial');
    expect(body.data.export_metadata.completeness.truncated_sections).toEqual([
      { section: 'security_audit_logs', limit: 1000 },
    ]);
  });

  it('reports a complete export when every section was read', async () => {
    const response = await GET(exportRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('X-Export-Status')).toBe('complete');
    expect(body.success).toBe(true);
    expect(body.status).toBe('complete');
    expect(body.data.export_metadata.completeness).toMatchObject({
      status: 'complete',
      unavailable_sections: [],
      skipped_rows: [],
    });
  });

  it('exports linked bank metadata and exclusions without authentication material', async () => {
    const createdAt = '2026-09-01T00:00:00.000Z';
    const updatedAt = '2026-09-02T00:00:00.000Z';
    const credentialFixture = 'never-export-this-credential';
    const items = [
      {
        id: 'bank-item-linked',
        plaid_item_id: 'linked-item-fixture',
        institution_name: 'Fixture bank',
        excluded_account_ids: ['account-hidden-fixture'],
        created_at: createdAt,
        updated_at: updatedAt,
      },
      {
        id: 'bank-item-legacy',
        plaid_item_id: null,
        institution_name: null,
        excluded_account_ids: [],
        created_at: createdAt,
        updated_at: updatedAt,
      },
    ];
    mockQuery.mockImplementation(async (sql: string) =>
      sql.includes('from bank_account_items')
        ? items.map((item) => ({
            ...item,
            created_at: new Date(item.created_at),
            user_id: 'user_export',
            access_token_enc: credentialFixture,
          }))
        : [],
    );

    const response = await GET(exportRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.bank_account_items).toEqual(items);
    expect(JSON.stringify(body)).not.toContain(credentialFixture);
    expect(body.data.bank_account_items[0]).not.toHaveProperty('access_token_enc');
    expect(body.data.bank_account_items[0]).not.toHaveProperty('user_id');
    const reads = mockQuery.mock.calls.filter(([sql]) =>
      String(sql).includes('from bank_account_items'),
    );
    expect(reads).toHaveLength(1);
    expect(reads[0]?.[0]).toMatch(/where user_id = \$1/);
    expect(reads[0]?.[0]).not.toMatch(/\*|access_token_enc/);
    expect(reads[0]?.[1]).toEqual(['user_export']);
  });

  it('names linked banks as unavailable instead of silently omitting a failed read', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('from bank_account_items')) throw new Error('linked banks unavailable');
      return [];
    });

    const response = await GET(exportRequest());
    const body = await response.json();

    expect(response.headers.get('X-Export-Status')).toBe('partial');
    expect(body.success).toBe(false);
    expect(body.data.export_metadata.completeness.unavailable_sections).toEqual([
      'bank_account_items',
    ]);
  });

  it('reports invalid linked bank rows instead of calling their omission complete', async () => {
    mockQuery.mockImplementation(async (sql: string) =>
      sql.includes('from bank_account_items') ? [{ id: 'bank-item-invalid' }] : [],
    );

    const response = await GET(exportRequest());
    const body = await response.json();

    expect(body.status).toBe('partial');
    expect(body.data.export_metadata.completeness.skipped_rows).toEqual([
      { section: 'bank_account_items', count: 1 },
    ]);
  });

  it('does not read linked banks before the requester authenticates', async () => {
    mockGetClerkAuthUser.mockRejectedValueOnce(new Error('Sign-in required'));

    await expect(GET(exportRequest())).rejects.toThrow('Sign-in required');

    expect(mockQuery).not.toHaveBeenCalled();
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
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    const body = JSON.parse(await response.text());
    expect(body.export_metadata.completeness.status).toBe('partial');
  });
});
