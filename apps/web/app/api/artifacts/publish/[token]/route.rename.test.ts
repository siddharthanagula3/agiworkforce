import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { ManagedCloudPublishedArtifactUpdateResponseSchema } from '@agiworkforce/cloud-contracts';
type Original0 = typeof import('@/lib/csrf');
type Original1 = typeof import('@/lib/rate-limit');
type Original2 = typeof import('@/lib/server/rls-db');
type Original3 = typeof import('@/lib/security/outbound-content-inspection');
type Original4 = typeof import('@/lib/services/organization-policy-gate');

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  csrf: vi.fn(async (..._args: unknown[]): Promise<Response | null> => null),
  rateLimit: vi.fn(async (..._args: unknown[]): Promise<Response | null> => null),
  scopedDb: vi.fn(),
  inspect: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<Original0>()),
  requireCsrfToken: (...a: unknown[]) => mocks.csrf(...a),
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<Original1>()),
  withRateLimit: (...a: unknown[]) => mocks.rateLimit(...a),
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<Original2>()),
  getUserScopedDb: (...a: unknown[]) => mocks.scopedDb(...a),
}));
vi.mock('@/lib/security/outbound-content-inspection', async (importOriginal) => ({
  ...(await importOriginal<Original3>()),
  inspectOutboundContent: (...a: unknown[]) => mocks.inspect(...a),
}));
vi.mock('@/lib/services/organization-policy-gate', async (importOriginal) => ({
  ...(await importOriginal<Original4>()),
  resolveSecretHandlingPolicy: vi.fn(async () => ({ mode: 'redact', organizationId: null })),
}));

const { PATCH } = await import('./route');

const TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaa';

function call(body: unknown, token = TOKEN) {
  return PATCH(
    new NextRequest(`https://agiworkforce.com/api/artifacts/publish/${token}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }),
    { params: Promise.resolve({ token }) },
  );
}

function renamedRow(title: string) {
  return {
    id: 'row-1',
    token: TOKEN,
    user_id: 'user-1',
    artifact_id: 'artifact-1',
    conversation_id: null,
    title,
    kind: 'html',
    language: null,
    content: '<h1>hi</h1>',
    visibility: 'public',
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-10T00:00:00.000Z',
  };
}

function signIn(userId: string) {
  mocks.scopedDb.mockResolvedValue({
    db: { query: (...args: unknown[]) => mocks.query(...args) },
    userId,
    organizationId: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.csrf.mockResolvedValue(null);
  mocks.rateLimit.mockResolvedValue(null);
  mocks.inspect.mockImplementation(async (input: { value: string }) => ({
    action: 'allowed',
    value: input.value,
    findings: [],
  }));
  mocks.query.mockImplementation(async (_sql: string, params: unknown[]) => [
    renamedRow(String(params[2])),
  ]);
  signIn('user-1');
});

describe('PATCH /api/artifacts/publish/[token] with a title', () => {
  it("renames the owner's site and answers with the shared update contract", async () => {
    const response = await call({ title: '  Team scoreboard  ' });

    expect(response.status).toBe(200);
    const body = ManagedCloudPublishedArtifactUpdateResponseSchema.parse(await response.json());
    expect(body).toMatchObject({ token: TOKEN, title: 'Team scoreboard', visibility: 'public' });

    const [sql, params] = mocks.query.mock.calls[0]!;
    expect(sql).toContain('update public.published_artifacts');
    expect(sql).toContain('where token = $1 and user_id = $2');
    expect(params).toEqual([TOKEN, 'user-1', 'Team scoreboard']);
  });

  it("answers 404 when the token belongs to another user's site", async () => {
    signIn('user-2');
    mocks.query.mockResolvedValue([]);

    const response = await call({ title: 'Mine now' });

    expect(response.status).toBe(404);
    expect(mocks.query.mock.calls[0]![1]).toEqual([TOKEN, 'user-2', 'Mine now']);
  });

  it('answers 401 to a signed-out caller before renaming anything', async () => {
    const { createError } = await import('@/lib/errors');
    mocks.scopedDb.mockRejectedValue(createError.unauthorized());

    expect((await call({ title: 'Anything' })).status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('refuses a cross-site rename before touching the database', async () => {
    mocks.csrf.mockResolvedValue(NextResponse.json({ error: 'csrf' }, { status: 403 }));

    expect((await call({ title: 'Anything' })).status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('stores the redacted name when the outbound inspection finds a secret', async () => {
    mocks.inspect.mockResolvedValue({ action: 'redacted', value: 'Key [REDACTED]', findings: [] });

    const response = await call({ title: 'Key sk-live-123' });

    expect(response.status).toBe(200);
    expect(mocks.query.mock.calls[0]![1]).toEqual([TOKEN, 'user-1', 'Key [REDACTED]']);
    expect(mocks.inspect).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'artifact_publish', resourceId: TOKEN }),
    );
  });

  it('refuses a name the outbound inspection blocks', async () => {
    mocks.inspect.mockResolvedValue({ action: 'blocked', message: 'Blocked', findings: [] });

    expect((await call({ title: 'Key sk-live-123' })).status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('rejects an empty name and a body that changes nothing', async () => {
    expect((await call({ title: '   ' })).status).toBe(400);
    expect((await call({})).status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('rejects a name longer than the contract allows', async () => {
    expect((await call({ title: 'x'.repeat(301) })).status).toBe(400);
  });
});
