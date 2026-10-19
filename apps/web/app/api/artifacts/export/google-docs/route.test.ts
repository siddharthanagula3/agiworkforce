import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: async () => null }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: async () => null }));
vi.mock('@/lib/connectors/connector-capability', () => ({
  assertConnectorsReleased: () => undefined,
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: async () => ({ db: { query: vi.fn() }, userId: 'user-1', organizationId: null }),
}));
vi.mock('@/lib/connectors/oauth-access', () => ({
  connectorUnreachableMessage: (name: string) => `${name} is unreachable`,
  resolveConnectorAccessToken: () => mocks.access(),
}));

const { POST } = await import('./route');

function call(body: unknown = { title: 'Plan', content: '# Plan\n\nShip in March.' }) {
  return POST(
    new NextRequest('http://localhost/api/artifacts/export/google-docs', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', mocks.fetch);
});

describe('POST /api/artifacts/export/google-docs', () => {
  it('creates a Google Doc from the document through the Drive upload API', async () => {
    mocks.access.mockResolvedValue({
      status: 'ready',
      accessToken: 'tok',
      grantedScopes: ['https://www.googleapis.com/auth/drive.file'],
      accountKey: 'k',
      tokenType: 'Bearer',
    });
    mocks.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'doc-1',
          webViewLink: 'https://docs.google.com/document/d/doc-1/edit',
        }),
      ),
    );
    const response = await call();
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ url: 'https://docs.google.com/document/d/doc-1/edit' });
    const [url, init] = mocks.fetch.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toContain(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    );
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer tok');
    const sent = new TextDecoder().decode(init.body as Uint8Array);
    expect(sent).toContain('"mimeType":"application/vnd.google-apps.document"');
    expect(sent).toContain('"name":"Plan"');
  });

  it('asks to connect Drive when it is not connected', async () => {
    mocks.access.mockResolvedValue({ status: 'not-connected' });
    const response = await call();
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: 'google_drive_not_connected' } });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('refuses to try when Drive was granted read access only', async () => {
    mocks.access.mockResolvedValue({
      status: 'ready',
      accessToken: 'tok',
      grantedScopes: ['https://www.googleapis.com/auth/drive.readonly'],
      accountKey: 'k',
      tokenType: 'Bearer',
    });
    const response = await call();
    expect(await response.json()).toMatchObject({
      error: { code: 'google_drive_write_not_granted' },
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('reports a Drive refusal in plain words', async () => {
    mocks.access.mockResolvedValue({
      status: 'ready',
      accessToken: 'tok',
      grantedScopes: ['drive.file'],
      accountKey: 'k',
      tokenType: 'Bearer',
    });
    mocks.fetch.mockResolvedValue(new Response('denied', { status: 403 }));
    const response = await call();
    expect(response.status).toBe(409);
  });

  it('rejects an empty document', async () => {
    expect((await call({ title: 'x', content: '' })).status).toBe(400);
  });
});
