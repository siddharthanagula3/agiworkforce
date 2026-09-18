import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { PRESIGNED_URL_MAX_TTL_SECONDS } from '@agiworkforce/object-storage';

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

import { RETENTION_MATRIX } from '@/lib/services/deletion-manifest';
import { USER_SCOPED_TABLES } from '@/lib/server/account-erasure';
import { GET, UNEXPORTED_USER_TABLES } from '../export/route';

const ASSET_ID = '3f1d6c52-9a4e-4f2b-9c1a-2d5e7b8a0c11';
const source = readFileSync(join(process.cwd(), 'app/api/user/export/route.ts'), 'utf8');

/**
 * Content the subject wrote that the export deliberately does not carry.
 * Each member has to declare its reason in UNEXPORTED_USER_TABLES too, so
 * withholding a new class of content is a decision made twice, in the open.
 */
const CONTENT_WITHHELD_ON_PURPOSE = new Set(['mcp_app_payloads']);

function tablesTheExportReads(): Set<string> {
  const tables = new Set<string>();
  for (const query of source.matchAll(/sql: `([\s\S]*?)`/g)) {
    for (const reference of (query[1] as string).matchAll(
      /\b(?:from|join)\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi,
    )) {
      tables.add((reference[1] as string).toLowerCase());
    }
  }
  return tables;
}

function contentStoresErasureDeletes(): string[] {
  const erased = new Set(USER_SCOPED_TABLES.map(({ table }) => table));
  return RETENTION_MATRIX.filter(
    (entry) =>
      entry.kind === 'table' && entry.dataClass === 'customer_content' && erased.has(entry.store),
  ).map((entry) => entry.store);
}

describe('the export carries every class of content the account owns', () => {
  it('reads each store the retention matrix calls the subject content', () => {
    const read = tablesTheExportReads();
    const missing = contentStoresErasureDeletes().filter(
      (store) => !read.has(store) && !CONTENT_WITHHELD_ON_PURPOSE.has(store),
    );

    expect(
      missing,
      `The retention matrix classes ${missing.join(', ')} as this subject's own content and account erasure deletes it, but the export never reads it. Add a section, or withhold it on purpose in both UNEXPORTED_USER_TABLES and CONTENT_WITHHELD_ON_PURPOSE.`,
    ).toEqual([]);
  });

  it('makes every deliberate withholding say why, in the route itself', () => {
    for (const store of CONTENT_WITHHELD_ON_PURPOSE) {
      expect(UNEXPORTED_USER_TABLES[store], `${store} is withheld with no reason`).toBeTruthy();
    }
  });

  it('keeps the withheld set honest about what the export actually reads', () => {
    const read = tablesTheExportReads();
    const contradictory = [...CONTENT_WITHHELD_ON_PURPOSE].filter((store) => read.has(store));

    expect(contradictory).toEqual([]);
  });

  it('scopes every section it reads to the subject asking for it', () => {
    const unscoped: string[] = [];
    let sections = 0;
    for (const section of source.matchAll(
      /section: '([a-z_]+)',\s*table: '[a-z_]+',\s*sql: `([\s\S]*?)`/g,
    )) {
      const [, name, sql] = section as unknown as [string, string, string];
      sections += 1;
      if (!/\b(?:user_id|owner_user_id|owner_id)\s*=\s*\$1/.test(sql)) unscoped.push(name);
    }

    expect(sections).toBeGreaterThan(30);
    expect(unscoped).toEqual([]);
  });
});

describe('the links inside an export', () => {
  async function exportBody(): Promise<{
    data: {
      media_assets: Array<{ download_url: string; storage_url: string }>;
      export_metadata: { media_downloads: { expires_at: string | null; expiry: string } };
    };
  }> {
    vi.clearAllMocks();
    delete process.env['NEXT_PUBLIC_APP_URL'];
    mockGetClerkAuthUser.mockResolvedValue({ userId: 'user_export', email: 'user@example.com' });
    mockQuery.mockImplementation(async (sql: string) =>
      sql.includes('from public.media_assets')
        ? [
            {
              id: ASSET_ID,
              kind: 'image',
              mime_type: 'image/png',
              byte_size: 2048,
              storage_url: 'private-media/image/9f2/asset.png',
              prompt: null,
              provider: null,
              model: null,
              width: 512,
              height: 512,
              source_surface: 'web',
              temporary_chat: false,
              created_at: '2026-03-01T00:00:00.000Z',
              deleted_at: null,
            },
          ]
        : [],
    );
    const response = await GET(new NextRequest('https://agiworkforce.com/api/user/export'));
    expect(response.status).toBe(200);
    return (await response.json()) as never;
  }

  it('hands out no presigned link, so nothing in the file outlives the account that asked', async () => {
    const body = await exportBody();
    const payload = JSON.stringify(body);

    expect(payload).not.toMatch(/X-Amz-Signature|X-Amz-Expires|expiresAt=/i);
    expect(body.data.media_assets[0]?.download_url).toBe(
      `https://agiworkforce.com/api/files/${ASSET_ID}`,
    );
  });

  it('says plainly that each link is authorised per request rather than timed', async () => {
    const documentation = (await exportBody()).data.export_metadata.media_downloads;

    expect(documentation.expires_at).toBeNull();
    expect(documentation.expiry).toMatch(/authorised on its own/i);
  });

  it('bounds any presigned link the storage layer does issue', () => {
    expect(PRESIGNED_URL_MAX_TTL_SECONDS).toBeGreaterThan(0);
    expect(PRESIGNED_URL_MAX_TTL_SECONDS).toBeLessThanOrEqual(3_600);
  });
});
