import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { createError } from '@/lib/errors';
import { requireCsrfToken } from '@/lib/csrf';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { preparePublishedArtifactPublication } from '@/lib/services/published-artifact-publication-policy';
import {
  readPublishedArtifactRestoreSource,
  readPublishedArtifactVersion,
  restorePublishedArtifactRecord,
  publishArtifactRecord,
  PublishedArtifactOwnershipError,
  PublishedArtifactQuotaError,
  PublishedArtifactValidationError,
} from '@/lib/services/published-artifact-service';
import { GET, POST } from './route';

vi.mock('server-only', () => ({}));
// Preserve execution of each production handler; inspect AppError before HTTP serialization.
vi.mock('@/lib/error-handler', () => ({ withErrorHandler: <T>(handler: T): T => handler }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn() }));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: vi.fn() }));
vi.mock('@/lib/services/published-artifact-publication-policy', () => ({
  preparePublishedArtifactPublication: vi.fn(),
}));
vi.mock('@/lib/services/published-artifact-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/published-artifact-service')>();
  return {
    ...actual,
    readPublishedArtifactRestoreSource: vi.fn(),
    readPublishedArtifactVersion: vi.fn(),
    restorePublishedArtifactRecord: vi.fn(),
    publishArtifactRecord: vi.fn(),
  };
});

const token = 'a'.repeat(24);
const db = { query: vi.fn() } as unknown as DatabaseAdapter;
const publication = {
  id: 'publication-id',
  token,
  artifactId: 'stored-artifact',
  conversationId: 'stored-conversation',
  title: 'Current renamed title',
  kind: 'html' as const,
  language: null,
  content: 'current',
  userId: 'owner',
  visibility: 'organization' as const,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-07T00:00:00.000Z',
};
const snapshot = {
  version: 3,
  title: 'Historical title',
  kind: 'html' as const,
  language: null,
  content: '<h1>Historical secret</h1>',
};
const restored = { ...publication, content: 'persisted redacted content', version: 9 };
const context = (version = '3', requestedToken = token) => ({
  params: Promise.resolve({ token: requestedToken, version }),
});
const request = () =>
  new NextRequest(`https://app.agiworkforce.test/api/artifacts/publish/${token}/versions/3`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: 'attacker',
      token: 'b'.repeat(24),
      artifactId: 'attacker-artifact',
      conversationId: 'attacker-conversation',
      title: 'attacker-title',
      content: 'attacker-content',
      visibility: 'public',
    }),
  });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireCsrfToken).mockResolvedValue(null);
  vi.mocked(withRateLimit).mockResolvedValue(null);
  vi.mocked(getUserScopedDb).mockResolvedValue({
    db,
    userId: 'owner',
    organizationId: 'active-org',
    surface: 'web',
  });
  vi.mocked(readPublishedArtifactRestoreSource).mockResolvedValue({ publication, snapshot });
  vi.mocked(preparePublishedArtifactPublication).mockResolvedValue({
    content: 'prepared redacted content',
  });
  vi.mocked(restorePublishedArtifactRecord).mockResolvedValue(restored);
});

function expectNoWrites() {
  expect(restorePublishedArtifactRecord).not.toHaveBeenCalled();
  expect(publishArtifactRecord).not.toHaveBeenCalled();
}

describe('version POST restore handler', () => {
  it.each(['0', '-1', '1.5', 'NaN', 'Infinity', '9007199254740992'])(
    'rejects invalid version %s before gates or writes',
    async (version) => {
      await expect(POST(request(), context(version))).rejects.toMatchObject({ statusCode: 404 });
      expect(requireCsrfToken).not.toHaveBeenCalled();
      expect(getUserScopedDb).not.toHaveBeenCalled();
      expectNoWrites();
    },
  );

  it('rejects malformed tokens before gates', async () => {
    await expect(POST(request(), context('3', '../invalid'))).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(requireCsrfToken).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it('returns CSRF refusal without authentication or persistence', async () => {
    const refusal = new Response('csrf', { status: 403 });
    vi.mocked(requireCsrfToken).mockResolvedValue(refusal);
    await expect(POST(request(), context())).resolves.toBe(refusal);
    expect(withRateLimit).not.toHaveBeenCalled();
    expect(getUserScopedDb).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it('uses share-create rate limiting before authentication', async () => {
    const req = request();
    const refusal = new Response('rate limit', { status: 429 });
    vi.mocked(withRateLimit).mockResolvedValue(refusal);
    await expect(POST(req, context())).resolves.toBe(refusal);
    expect(withRateLimit).toHaveBeenCalledExactlyOnceWith(req, 'share-create');
    expect(getUserScopedDb).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it('fails closed on authentication failure', async () => {
    vi.mocked(getUserScopedDb).mockRejectedValue(createError.unauthorized());
    await expect(POST(request(), context())).rejects.toMatchObject({ statusCode: 401 });
    expect(readPublishedArtifactRestoreSource).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it('returns 404 for a missing or foreign owned-source lookup without preparing or recreating', async () => {
    vi.mocked(readPublishedArtifactRestoreSource).mockResolvedValue(null);
    await expect(POST(request(), context())).rejects.toMatchObject({ statusCode: 404 });
    expect(readPublishedArtifactRestoreSource).toHaveBeenCalledExactlyOnceWith(db, {
      userId: 'owner',
      token,
      version: 3,
    });
    expect(preparePublishedArtifactPublication).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it('returns policy gate refusals before any writes', async () => {
    const refusal = new Response('organization policy', { status: 403 });
    vi.mocked(preparePublishedArtifactPublication).mockResolvedValue(refusal);
    await expect(POST(request(), context())).resolves.toBe(refusal);
    expectNoWrites();
  });

  it('propagates moderation or outbound rejection before writes', async () => {
    vi.mocked(preparePublishedArtifactPublication).mockRejectedValue(
      createError.validation('publication blocked'),
    );
    await expect(POST(request(), context())).rejects.toThrow('publication blocked');
    expectNoWrites();
  });

  it('ignores the body, prepares the historical snapshot and restores only server identity', async () => {
    const req = request();
    const json = vi.spyOn(req, 'json');
    const response = await POST(req, context());
    expect(json).not.toHaveBeenCalled();
    expect(preparePublishedArtifactPublication).toHaveBeenCalledExactlyOnceWith(db, {
      request: req,
      userId: 'owner',
      organizationId: 'active-org',
      artifactId: publication.artifactId,
      conversationId: publication.conversationId,
      title: snapshot.title,
      content: snapshot.content,
    });
    expect(restorePublishedArtifactRecord).toHaveBeenCalledExactlyOnceWith(db, {
      userId: 'owner',
      publishedArtifactId: publication.id,
      token,
      artifactId: publication.artifactId,
      conversationId: publication.conversationId,
      title: snapshot.title,
      kind: snapshot.kind,
      language: snapshot.language,
      content: 'prepared redacted content',
    });
    const order = [
      requireCsrfToken,
      withRateLimit,
      getUserScopedDb,
      readPublishedArtifactRestoreSource,
      preparePublishedArtifactPublication,
      restorePublishedArtifactRecord,
    ].map((mock) => vi.mocked(mock).mock.invocationCallOrder[0]!);
    expect(order).toEqual([...order].sort((left, right) => left - right));
    expect(publishArtifactRecord).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      token,
      title: restored.title,
      visibility: 'organization',
      version: 9,
      sandboxed: true,
    });
  });

  it('returns 409 after a lost publication without retry or fallback', async () => {
    vi.mocked(restorePublishedArtifactRecord).mockResolvedValue(null);
    await expect(POST(request(), context())).rejects.toMatchObject({ statusCode: 409 });
    expect(restorePublishedArtifactRecord).toHaveBeenCalledTimes(1);
    expect(publishArtifactRecord).not.toHaveBeenCalled();
  });

  it.each([
    [new PublishedArtifactValidationError('invalid'), 400],
    [new PublishedArtifactOwnershipError('foreign'), 403],
    [new PublishedArtifactQuotaError('quota'), 409],
  ])('maps persistence error %s without replay', async (error, statusCode) => {
    vi.mocked(restorePublishedArtifactRecord).mockRejectedValue(error);
    await expect(POST(request(), context())).rejects.toMatchObject({ statusCode });
    expect(restorePublishedArtifactRecord).toHaveBeenCalledTimes(1);
    expect(publishArtifactRecord).not.toHaveBeenCalled();
  });

  it.each(['history unavailable', 'commit outcome unknown'])(
    'propagates service rejection %s without retry or generic Publish',
    async (message) => {
      vi.mocked(restorePublishedArtifactRecord).mockRejectedValue(new Error(message));
      await expect(POST(request(), context())).rejects.toThrow(message);
      expect(restorePublishedArtifactRecord).toHaveBeenCalledTimes(1);
      expect(publishArtifactRecord).not.toHaveBeenCalled();
    },
  );

  it('waits for the transaction-owning service before returning success', async () => {
    let enterService!: () => void;
    const entered = new Promise<void>((resolve) => {
      enterService = resolve;
    });
    let finishService!: (value: typeof restored) => void;
    const pending = new Promise<typeof restored>((resolve) => {
      finishService = resolve;
    });
    vi.mocked(restorePublishedArtifactRecord).mockImplementation(() => {
      enterService();
      return pending;
    });
    let settled = false;
    const response = POST(request(), context()).then((result) => {
      settled = true;
      return result;
    });
    await entered;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).toBe(false);
    finishService(restored);
    expect(await (await response).json()).toMatchObject({ version: restored.version });
    expect(restorePublishedArtifactRecord).toHaveBeenCalledTimes(1);
    expect(publishArtifactRecord).not.toHaveBeenCalled();
  }, 1_000);
});

describe('version GET remains read-only', () => {
  it('uses owner-scoped version read and chat-conversation limit without restore gates', async () => {
    vi.mocked(readPublishedArtifactVersion).mockResolvedValue(snapshot);
    const req = new NextRequest(
      `https://app.agiworkforce.test/api/artifacts/publish/${token}/versions/3`,
    );
    const response = await GET(req, context());
    expect(await response.json()).toEqual(snapshot);
    expect(withRateLimit).toHaveBeenCalledExactlyOnceWith(req, 'chat-conversation');
    expect(readPublishedArtifactVersion).toHaveBeenCalledExactlyOnceWith(db, {
      userId: 'owner',
      token,
      version: 3,
    });
    expect(requireCsrfToken).not.toHaveBeenCalled();
    expect(preparePublishedArtifactPublication).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it('retains missing-version 404', async () => {
    vi.mocked(readPublishedArtifactVersion).mockResolvedValue(null);
    await expect(
      GET(new NextRequest('https://app.agiworkforce.test'), context()),
    ).rejects.toMatchObject({ statusCode: 404 });
    expectNoWrites();
  });
});
