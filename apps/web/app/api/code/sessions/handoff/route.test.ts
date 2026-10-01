import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
type ScanModule0 = typeof import('@/lib/security-audit');

const { auditSpy } = vi.hoisted(() => ({
  auditSpy: vi.fn(async (_event: Record<string, unknown>) => undefined),
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  recordAuditEvent: auditSpy,
}));

const { mockGetUserScopedDb, mockCsrf, mockRateLimit, mockOpen } = vi.hoisted(() => ({
  mockGetUserScopedDb: vi.fn(),
  mockCsrf: vi.fn(),
  mockRateLimit: vi.fn(),
  mockOpen: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mockRateLimit }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mockCsrf }));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mockGetUserScopedDb }));
vi.mock('@/lib/services/cloud-code-session-open', () => ({ openCloudCodeSession: mockOpen }));

import { POST } from './route';

const USER_ID = 'user-1';
const FINGERPRINT = createHash('sha256').update(USER_ID).digest('hex').slice(0, 32);
const SESSION = { id: 'session-1', title: 'Fix the login redirect' };

function handoff(overrides: Record<string, unknown> = {}) {
  return {
    protocolVersion: 8,
    threadId: 'thread-1',
    origin: 'developer_session',
    issuedBy: 'cli',
    issuedAt: new Date(Date.now() - 60_000).toISOString(),
    fromEnvironment: 'local',
    toEnvironment: 'cloud',
    workspace: {
      cwd: '/repo',
      repository: 'git@github.com:acme/widgets.git',
      branch: 'feature/login',
      uncommittedChanges: true,
    },
    posture: { agentMode: 'ask', trustMode: 'managed', permissionProfileId: 'default' },
    objective: 'Fix the login redirect',
    plan: [{ description: 'Reproduce the redirect loop', state: 'done' }],
    modifiedFiles: [{ path: 'src/login.ts', kind: 'modified' }],
    issuedForAccount: FINGERPRINT,
    ...overrides,
  };
}

function postRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/code/sessions/handoff', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCsrf.mockResolvedValue(null);
  mockRateLimit.mockResolvedValue(null);
  mockGetUserScopedDb.mockResolvedValue({ db: {}, userId: USER_ID, organizationId: null });
  mockOpen.mockResolvedValue({ session: SESSION, reused: false });
});

describe('POST /api/code/sessions/handoff', () => {
  it('opens a cloud session from a fresh handoff addressed to managed Code', async () => {
    const response = await POST(postRequest({ handoff: handoff() }));
    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      start: { kind: string };
      seedPrompt: string;
      warnings: string[];
    };
    expect(body.start).toEqual({ kind: 'resume', threadId: 'thread-1' });
    expect(body.seedPrompt).toContain('Fix the login redirect');
    expect(body.seedPrompt).toContain('modified: src/login.ts');
    expect(body.warnings).toEqual(['uncommitted_changes_not_included']);
    const [, , owner, input] = mockOpen.mock.calls[0]!;
    expect(owner).toEqual({ userId: USER_ID, organizationId: null });
    expect(input).toMatchObject({
      title: 'Fix the login redirect',
      networkAccess: 'trusted',
      repositoryUrl: 'https://github.com/acme/widgets.git',
      repositoryBranch: 'feature/login',
    });
    expect(input.requestId).toMatch(/^handoff-[0-9a-f]{48}$/);
  });

  it('records the opened session by id, with none of the handoff content', async () => {
    const response = await POST(postRequest({ handoff: handoff() }));

    expect(response.status).toBe(201);
    expect(auditSpy).toHaveBeenCalledTimes(1);
    const event = auditSpy.mock.calls[0]![0];
    expect(event).toMatchObject({
      userId: USER_ID,
      organizationId: null,
      eventType: 'code_session_lifecycle_changed',
    });
    expect(event['detail']).toEqual({
      resourceType: 'code_session',
      resourceId: 'session-1',
      status: 'opened',
      source: 'handoff',
    });
    expect(JSON.stringify(event['detail'])).not.toMatch(/login|acme|widgets|src\//i);
  });

  it('records nothing when the handoff is refused', async () => {
    const response = await POST(
      postRequest({ handoff: handoff({ issuedForAccount: 'f'.repeat(32) }) }),
    );

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(auditSpy).not.toHaveBeenCalled();
  });

  it('gives the same request id to the same handoff so a retry reuses the session', async () => {
    const record = handoff();
    await POST(postRequest({ handoff: record }));
    await POST(postRequest({ handoff: record }));
    expect(mockOpen.mock.calls[0]![3].requestId).toBe(mockOpen.mock.calls[1]![3].requestId);
  });

  it('records the opening once when a retried handoff reuses the session', async () => {
    mockOpen
      .mockResolvedValueOnce({ session: SESSION, reused: false })
      .mockResolvedValueOnce({ session: SESSION, reused: true });
    const record = handoff();

    const first = await POST(postRequest({ handoff: record }));
    const retry = await POST(postRequest({ handoff: record }));

    expect(first.status).toBe(201);
    expect(retry.status).toBe(201);
    expect(((await retry.json()) as { session: { id: string } }).session.id).toBe('session-1');
    expect(auditSpy).toHaveBeenCalledTimes(1);
  });

  it('refuses a handoff issued for another account', async () => {
    const response = await POST(postRequest({ handoff: handoff({ issuedForAccount: 'other' }) }));
    expect(response.status).toBe(422);
    const body = (await response.json()) as { error: { refusal: { reason: string } } };
    expect(body.error.refusal.reason).toBe('wrongAccount');
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it('refuses a handoff older than its admission window', async () => {
    const issuedAt = new Date(Date.now() - 16 * 60_000).toISOString();
    const response = await POST(postRequest({ handoff: handoff({ issuedAt }) }));
    expect(response.status).toBe(422);
    const body = (await response.json()) as { error: { refusal: { reason: string } } };
    expect(body.error.refusal.reason).toBe('expired');
  });

  it('refuses a handoff addressed to a local session', async () => {
    const response = await POST(postRequest({ handoff: handoff({ toEnvironment: 'local' }) }));
    const body = (await response.json()) as { error: { refusal: { reason: string } } };
    expect(body.error.refusal.reason).toBe('wrongDestination');
  });

  it('carries the full-network acknowledgement to the session gate', async () => {
    await POST(
      postRequest({ handoff: handoff(), networkAccess: 'full', fullNetworkAcknowledged: true }),
    );
    expect(mockOpen.mock.calls[0]![3]).toMatchObject({
      networkAccess: 'full',
      fullNetworkAcknowledged: true,
    });
  });

  it('refuses a record over the body cap before opening anything', async () => {
    const response = await POST(
      postRequest({
        handoff: handoff({ pendingApprovals: [{ note: 'x'.repeat(600 * 1024) }] }),
      }),
    );
    expect(response.status).toBe(413);
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it('refuses an unbounded field instead of storing it', async () => {
    const response = await POST(
      postRequest({ handoff: handoff({ issuedForAccount: 'f'.repeat(10_000) }) }),
    );
    expect(response.status).toBe(400);
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it('refuses a repository that is not on GitHub', async () => {
    const response = await POST(
      postRequest({
        handoff: handoff({
          workspace: { cwd: '/repo', repository: 'https://gitlab.com/acme/widgets.git' },
        }),
      }),
    );
    expect(response.status).toBe(400);
    expect(mockOpen).not.toHaveBeenCalled();
  });
});
