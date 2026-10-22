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

const granted = {
  status: 'ready',
  accessToken: 'tok',
  grantedScopes: ['https://www.googleapis.com/auth/drive.file'],
  accountKey: 'k',
  tokenType: 'Bearer',
};

const htmlFile = {
  fileName: 'Landing page.html',
  mimeType: 'text/html',
  encoding: 'utf8',
  content: '<h1>Hello</h1>',
};

function call(body: unknown = htmlFile) {
  return POST(
    new NextRequest('http://localhost/api/artifacts/save-to-drive', {
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

describe('POST /api/artifacts/save-to-drive', () => {
  it('stores the file in its own format through the Drive multipart upload', async () => {
    mocks.access.mockResolvedValue(granted);
    mocks.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'file-1',
          webViewLink: 'https://drive.google.com/file/d/file-1/view',
        }),
      ),
    );
    const response = await call();
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      fileName: 'Landing page.html',
      url: 'https://drive.google.com/file/d/file-1/view',
    });
    const [url, init] = mocks.fetch.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toContain(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    );
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer tok');
    const sent = new TextDecoder().decode(init.body as Uint8Array);
    expect(sent).toContain('"name":"Landing page.html"');
    expect(sent).not.toContain('google-apps');
    expect(sent).toContain('Content-Type: text/html\r\n\r\n<h1>Hello</h1>');
  });

  it('decodes a base64 file to its original bytes', async () => {
    mocks.access.mockResolvedValue(granted);
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ id: 'file-2' })));
    const bytes = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0xff, 0x00]);
    const response = await call({
      fileName: 'deck.pptx',
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      encoding: 'base64',
      content: Buffer.from(bytes).toString('base64'),
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ fileName: 'deck.pptx' });
    const sentBody = (mocks.fetch.mock.calls[0] as [URL, RequestInit])[1].body as Uint8Array;
    const tail = Buffer.from('\r\n--');
    const index = Buffer.from(sentBody).indexOf(Buffer.from(bytes));
    expect(index).toBeGreaterThan(0);
    expect(Buffer.from(sentBody).subarray(index + bytes.length, index + bytes.length + 4)).toEqual(
      tail,
    );
  });

  it('asks to connect Drive when it is not connected', async () => {
    mocks.access.mockResolvedValue({ status: 'not-connected' });
    const response = await call();
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: 'google_drive_not_connected' } });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('asks to reconnect Drive when the grant can no longer be used', async () => {
    mocks.access.mockResolvedValue({ status: 'reauthorization-required', reason: 'expired' });
    const response = await call();
    expect(await response.json()).toMatchObject({
      error: { code: 'google_drive_reconnect_required' },
    });
  });

  it('refuses to try when Drive was granted read access only', async () => {
    mocks.access.mockResolvedValue({
      ...granted,
      grantedScopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });
    const response = await call();
    expect(await response.json()).toMatchObject({
      error: { code: 'google_drive_write_not_granted' },
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('reports a Drive refusal as a conflict', async () => {
    mocks.access.mockResolvedValue(granted);
    mocks.fetch.mockResolvedValue(new Response('denied', { status: 403 }));
    expect((await call()).status).toBe(409);
  });

  it('rejects a file name that carries a path', async () => {
    expect((await call({ ...htmlFile, fileName: '../x.html' })).status).toBe(400);
    expect(mocks.access).not.toHaveBeenCalled();
  });

  it('rejects a file over the size limit', async () => {
    const response = await call({ ...htmlFile, content: 'é'.repeat(2_000_000) });
    expect(response.status).toBe(400);
    expect(mocks.access).not.toHaveBeenCalled();
  });
});
