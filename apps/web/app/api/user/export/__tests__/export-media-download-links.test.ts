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

const { GET } = await import('../route');

const ASSET_ID = '3f1d6c52-9a4e-4f2b-9c1a-2d5e7b8a0c11';

interface ExportBody {
  data: {
    export_metadata: {
      media_downloads: {
        url_field: string;
        authorization: string;
        expires_at: string | null;
        expiry: string;
        storage_url: string;
      };
    };
    media_assets: { id: string; storage_url: string; download_url: string }[];
  };
}

describe('the export hands back reachable media, not private storage keys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env['NEXT_PUBLIC_APP_URL'];
    mockGetClerkAuthUser.mockResolvedValue({ userId: 'user_export', email: 'user@example.com' });
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('from public.media_assets')) {
        return [
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
            created_at: '2026-03-01T00:00:00.000Z',
            deleted_at: null,
          },
        ];
      }
      return [];
    });
  });

  async function exportBody(url = 'https://agiworkforce.com/api/user/export'): Promise<ExportBody> {
    const response = await GET(new NextRequest(url));
    expect(response.status).toBe(200);
    return (await response.json()) as ExportBody;
  }

  it('gives every exported media row an authorised download link', async () => {
    const body = await exportBody();
    const asset = body.data.media_assets[0]!;

    expect(asset.download_url).toBe(`https://agiworkforce.com/api/files/${ASSET_ID}`);
    expect(asset.storage_url).toBe('private-media/image/9f2/asset.png');
  });

  it('documents what the link needs and whether it expires', async () => {
    const documentation = (await exportBody()).data.export_metadata.media_downloads;

    expect(documentation.url_field).toBe('download_url');
    expect(documentation.expires_at).toBeNull();
    expect(documentation.expiry).toMatch(/do not expire/i);
    expect(documentation.authorization).toMatch(/signed in as this account/i);
    expect(documentation.storage_url).toMatch(/not a download link/i);
  });

  it('builds the link on the configured app origin when there is one', async () => {
    process.env['NEXT_PUBLIC_APP_URL'] = 'https://app.example.test/';

    const body = await exportBody('https://internal-host.invalid/api/user/export');

    expect(body.data.media_assets[0]!.download_url).toBe(
      `https://app.example.test/api/files/${ASSET_ID}`,
    );
  });
});
