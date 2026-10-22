import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  credentialedFetch: vi.fn(),
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
type GuardedFetchModule = typeof import('@/lib/url-fetch/guarded-fetch');
vi.mock('@/lib/url-fetch/guarded-fetch', async (importOriginal) => ({
  ...(await importOriginal<GuardedFetchModule>()),
  credentialedFetch: (...args: unknown[]) => mocks.credentialedFetch(...args),
}));

const { POST } = await import('./route');

const granted = {
  status: 'ready',
  accessToken: 'tok',
  grantedScopes: ['https://graph.microsoft.com/Files.ReadWrite.AppFolder', 'User.Read'],
  accountKey: 'k',
  tokenType: 'Bearer',
};

const markdownFile = {
  fileName: 'Q3 plan.md',
  mimeType: 'text/markdown',
  encoding: 'utf8',
  content: '# Plan',
};

function reply(status: number, body: unknown = {}) {
  return { ok: true, response: new Response(JSON.stringify(body), { status }) };
}

type GraphCall = [URL, { method: string; headers: Record<string, string>; body?: Uint8Array }];

function folderPath(target: URL): string {
  return decodeURIComponent(target.pathname)
    .split('approot:/')[1]!
    .replace(/:\/content$/, '');
}

function graphFolder(taken: readonly string[], putReply: ReturnType<typeof reply>) {
  mocks.credentialedFetch.mockImplementation(async (target: URL, init: { method: string }) =>
    init.method === 'GET'
      ? reply(taken.includes(folderPath(target)) ? 200 : 404, { id: 'existing' })
      : putReply,
  );
}

function putCall(): GraphCall {
  return mocks.credentialedFetch.mock.calls.find(
    ([, init]) => (init as { method: string }).method === 'PUT',
  ) as unknown as GraphCall;
}

function call(body: unknown = markdownFile) {
  return POST(
    new NextRequest('http://localhost/api/artifacts/save-to-onedrive', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/artifacts/save-to-onedrive', () => {
  it('puts the file into the OneDrive app folder through Microsoft Graph', async () => {
    mocks.access.mockResolvedValue(granted);
    graphFolder(
      [],
      reply(201, {
        id: 'item-1',
        name: 'Q3 plan.md',
        webUrl: 'https://onedrive.live.com/?id=item-1',
      }),
    );
    const response = await call();
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      fileName: 'Q3 plan.md',
      url: 'https://onedrive.live.com/?id=item-1',
    });
    const [target, init] = putCall();
    expect(target.href).toBe(
      'https://graph.microsoft.com/v1.0/me/drive/special/approot:/Q3%20plan.md:/content',
    );
    expect(init.method).toBe('PUT');
    expect(init.headers['Authorization']).toBe('Bearer tok');
    expect(init.headers['Content-Type']).toBe('text/markdown');
    expect(new TextDecoder().decode(init.body)).toBe('# Plan');
    expect(target.search).toBe('');
  });

  it('sends the original bytes of a base64 file', async () => {
    mocks.access.mockResolvedValue(granted);
    graphFolder([], reply(201, { id: 'item-2', name: 'report.pdf' }));
    const bytes = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0xff, 0x00]);
    const response = await call({
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
      encoding: 'base64',
      content: Buffer.from(bytes).toString('base64'),
    });
    expect(await response.json()).toEqual({ fileName: 'report.pdf' });
    expect(Array.from(putCall()[1].body!)).toEqual(Array.from(bytes));
  });

  it('asks to connect OneDrive when it is not connected', async () => {
    mocks.access.mockResolvedValue({ status: 'not-connected' });
    const response = await call();
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: 'onedrive_not_connected' } });
    expect(mocks.credentialedFetch).not.toHaveBeenCalled();
  });

  it('asks to reconnect OneDrive when the grant can no longer be used', async () => {
    mocks.access.mockResolvedValue({ status: 'reauthorization-required', reason: 'expired' });
    expect(await (await call()).json()).toMatchObject({
      error: { code: 'onedrive_reconnect_required' },
    });
  });

  it('refuses to try when the app folder permission was not granted', async () => {
    mocks.access.mockResolvedValue({ ...granted, grantedScopes: ['User.Read', 'Files.Read'] });
    expect(await (await call()).json()).toMatchObject({
      error: { code: 'onedrive_write_not_granted' },
    });
    expect(mocks.credentialedFetch).not.toHaveBeenCalled();
  });

  it('reports a Graph refusal as a conflict', async () => {
    mocks.access.mockResolvedValue(granted);
    graphFolder([], reply(403, { error: { message: 'denied' } }));
    expect((await call()).status).toBe(409);
  });

  it('keeps an existing file by saving under the next free numbered name', async () => {
    mocks.access.mockResolvedValue(granted);
    graphFolder(
      ['Q3 plan.md', 'Q3 plan (2).md'],
      reply(201, { id: 'item-3', name: 'Q3 plan (3).md' }),
    );
    const response = await call();
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ fileName: 'Q3 plan (3).md' });
    const [target] = putCall();
    expect(folderPath(target)).toBe('Q3 plan (3).md');
    const probed = mocks.credentialedFetch.mock.calls
      .filter(([, init]) => (init as { method: string }).method === 'GET')
      .map(([probe]) => folderPath(probe as URL));
    expect(probed).toEqual(['Q3 plan.md', 'Q3 plan (2).md', 'Q3 plan (3).md']);
  });

  it('numbers a name without an extension after the name', async () => {
    mocks.access.mockResolvedValue(granted);
    graphFolder(['README'], reply(201, { id: 'item-4', name: 'README (2)' }));
    await call({ ...markdownFile, fileName: 'README' });
    expect(folderPath(putCall()[0])).toBe('README (2)');
  });

  it('writes nothing when the existence check is refused', async () => {
    mocks.access.mockResolvedValue(granted);
    mocks.credentialedFetch.mockResolvedValue(reply(403, {}));
    expect((await call()).status).toBe(409);
    expect(
      mocks.credentialedFetch.mock.calls.some(
        ([, init]) => (init as { method: string }).method === 'PUT',
      ),
    ).toBe(false);
  });

  it('reports an unanswered Graph request as a conflict', async () => {
    mocks.access.mockResolvedValue(granted);
    mocks.credentialedFetch.mockResolvedValue({ ok: false, refusal: 'blocked_host' });
    expect((await call()).status).toBe(409);
  });

  it('rejects a file name that carries a path', async () => {
    expect((await call({ ...markdownFile, fileName: 'a/b.md' })).status).toBe(400);
    expect(mocks.access).not.toHaveBeenCalled();
  });
});
