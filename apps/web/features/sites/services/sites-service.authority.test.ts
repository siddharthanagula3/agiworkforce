import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addCsrfHeaders } from '@/lib/client/csrf';
import {
  createRequestAuthority,
  type RequestAuthority,
  type SessionAuthority,
} from '@/lib/identity/request-authority';
import {
  listPublishedArtifactVersions,
  listPublishedSites,
  listPublishedSitesPage,
  readPublishedSite,
  republishArtifactVersion,
  unpublishArtifact,
} from './sites-service';

vi.mock('@/lib/client/csrf', () => ({ addCsrfHeaders: vi.fn() }));

const transport = vi.fn<typeof fetch>();
const artifact = { token: 'a'.repeat(24), artifactId: 'artifact-a' };
const fullArtifact = {
  ...artifact,
  conversationId: null,
  title: 'Owner page',
  kind: 'html',
  language: null,
  contentChars: 10,
  version: 4,
  visibility: 'public',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  shareUrl: `https://example.test/shared-artifact/${artifact.token}`,
  sandboxed: true,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function owner() {
  let identity = 'account-a/session-a';
  const session: SessionAuthority = {
    userId: 'account-a',
    sessionId: 'session-a',
    isCurrent: () => identity === 'account-a/session-a',
    getToken: vi.fn(async () => 'captured-token'),
  };
  const request = createRequestAuthority(session);
  return {
    session,
    request,
    change: (next: string) => {
      identity = next;
    },
  };
}
const operations = [
  {
    name: 'inventory',
    run: (request: RequestAuthority) => listPublishedSites(undefined, request),
    body: () => ({ artifacts: [], workspace: null }),
  },
  {
    name: 'history',
    run: (request: RequestAuthority) =>
      listPublishedArtifactVersions(artifact.token, undefined, request),
    body: () => ({ versions: [] }),
  },
  {
    name: 'restore',
    run: (request: RequestAuthority) => republishArtifactVersion(artifact, 2, request),
    body: () => ({ token: artifact.token, version: 9 }),
  },
  {
    name: 'unpublish',
    run: (request: RequestAuthority) => unpublishArtifact(artifact.token, request),
    body: () => ({ success: true, token: artifact.token }),
  },
];
const reads = [
  {
    name: 'inventory page',
    run: (request: RequestAuthority) => listPublishedSitesPage(null, undefined, request),
    body: () => ({ artifacts: [], workspace: null, pageInfo: { nextCursor: null } }),
  },
  {
    name: 'continuation',
    run: (request: RequestAuthority) =>
      listPublishedSitesPage('opaque+cursor/=', undefined, request),
    body: () => ({ artifacts: [], workspace: null, pageInfo: { nextCursor: null } }),
  },
  {
    name: 'owner detail',
    run: (request: RequestAuthority) => readPublishedSite(artifact.token, undefined, request),
    body: () => ({ artifact: fullArtifact, workspace: null }),
  },
];

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', transport);
  vi.mocked(addCsrfHeaders).mockResolvedValue({ 'X-CSRF-Token': 'csrf-a' });
});
afterEach(() => vi.unstubAllGlobals());

describe('published artifact service authority (UNRUN source fixtures)', () => {
  for (const operation of [...operations, ...reads]) {
    it(`${operation.name} uses captured credentials without cookies`, async () => {
      const captured = owner();
      transport.mockImplementation(async () => Response.json(operation.body()));
      await operation.run(captured.request);
      expect(transport).toHaveBeenCalledTimes(1);
      const init = transport.mock.calls[0]![1]!;
      expect(init.credentials).toBe('omit');
      expect(new Headers(init.headers).get('Authorization')).toBe('Bearer captured-token');
      expect(init.signal).toBeDefined();
    });

    it.each(['account-a/session-b', 'account-b/session-b', 'retire'])(
      `${operation.name} rejects %s during credentials`,
      async (next) => {
        const captured = owner();
        const token = deferred<string>();
        const entered = deferred<void>();
        captured.session.getToken = () => {
          entered.resolve();
          return token.promise;
        };
        const pending = operation.run(captured.request);
        const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
        await entered.promise;
        if (next === 'retire') captured.request.retire();
        else captured.change(next);
        token.resolve('old-token');
        await rejected;
        expect(transport).not.toHaveBeenCalled();
      },
    );

    it(`${operation.name} rejects a late transport response`, async () => {
      const captured = owner();
      const response = deferred<Response>();
      const entered = deferred<void>();
      transport.mockImplementation(() => {
        entered.resolve();
        return response.promise;
      });
      const pending = operation.run(captured.request);
      const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      await entered.promise;
      captured.request.retire();
      response.resolve(Response.json(operation.body()));
      await rejected;
      expect(transport).toHaveBeenCalledTimes(1);
    });

    it.each([200, 403])(
      `${operation.name} rejects retirement while reading status %s body`,
      async (status) => {
        const captured = owner();
        const body = deferred<unknown>();
        const entered = deferred<void>();
        const response = Response.json({}, { status });
        vi.spyOn(response, 'json').mockImplementation(() => {
          entered.resolve();
          return body.promise;
        });
        transport.mockResolvedValue(response);
        const pending = operation.run(captured.request);
        const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
        await entered.promise;
        captured.request.retire();
        body.resolve(
          status === 200 ? operation.body() : { error: { message: 'old account error' } },
        );
        await rejected;
      },
    );
  }

  it.each(operations.slice(2))(
    '$name stops after deferred CSRF when retired',
    async (operation) => {
      const captured = owner();
      const csrf = deferred<Record<string, string>>();
      vi.mocked(addCsrfHeaders).mockReturnValue(csrf.promise);
      const pending = operation.run(captured.request);
      const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      captured.request.retire();
      csrf.resolve({ 'X-CSRF-Token': 'old-csrf' });
      await rejected;
      expect(captured.session.getToken).not.toHaveBeenCalled();
      expect(transport).not.toHaveBeenCalled();
    },
  );

  it.each([
    { success: false, token: artifact.token },
    { success: true, token: 'other-token' },
    { success: true },
    {},
  ])('rejects an unpublish receipt without exact success and token: %j', async (receipt) => {
    transport.mockImplementation(async () => Response.json(receipt));
    await expect(unpublishArtifact(artifact.token, owner().request)).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it.each([
    { token: 'other-token', version: 9 },
    { token: artifact.token, version: 0 },
    { token: artifact.token, version: 1.5 },
    { token: artifact.token, version: Number.MAX_SAFE_INTEGER + 1 },
    {},
  ])('rejects a malformed restore receipt without fallback: %j', async (receipt) => {
    transport.mockImplementation(async () => Response.json(receipt));
    await expect(republishArtifactVersion(artifact, 2, owner().request)).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0]![1]?.method).toBe('POST');
    expect(transport.mock.calls[0]![1]).not.toHaveProperty('body');
  });

  it.each(operations.slice(2))(
    '$name rejects an authority-scoped empty success receipt',
    async (operation) => {
      transport.mockImplementation(async () => new Response(null, { status: 204 }));
      await expect(operation.run(owner().request)).rejects.toThrow();
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );

  it('accepts a deduplicated restore version without requiring a newly appended number', async () => {
    transport.mockImplementation(async () => Response.json({ token: artifact.token, version: 2 }));
    await expect(republishArtifactVersion(artifact, 2, owner().request)).resolves.toBeUndefined();
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it.each(['csrf', 'token', 'transport', 'body'] as const)(
    'replaces a stale %s rejection with retirement',
    async (stage) => {
      const captured = owner();
      const failure = deferred<never>();
      const entered = deferred<void>();
      if (stage === 'csrf')
        vi.mocked(addCsrfHeaders).mockImplementation(() => {
          entered.resolve();
          return failure.promise;
        });
      if (stage === 'token')
        captured.session.getToken = () => {
          entered.resolve();
          return failure.promise;
        };
      if (stage === 'transport')
        transport.mockImplementation(() => {
          entered.resolve();
          return failure.promise;
        });
      if (stage === 'body') {
        const response = Response.json({});
        vi.spyOn(response, 'json').mockImplementation(() => {
          entered.resolve();
          return failure.promise;
        });
        transport.mockResolvedValue(response);
      }
      const pending = unpublishArtifact(artifact.token, captured.request);
      const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      await entered.promise;
      captured.request.retire();
      failure.reject(new Error('old account failure'));
      await rejected;
      expect(transport).toHaveBeenCalledTimes(stage === 'csrf' || stage === 'token' ? 0 : 1);
    },
  );
});
