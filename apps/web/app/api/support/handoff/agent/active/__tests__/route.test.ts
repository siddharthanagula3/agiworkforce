import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  requirePlatformAdmin: vi.fn(),
  listConnectedSessionsForAgent: vi.fn(),
}));

vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule2>()),
  withRateLimit: mocks.withRateLimit,
}));
vi.mock('@/lib/auth-guards', () => ({ requirePlatformAdmin: mocks.requirePlatformAdmin }));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule1>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/support/handoff/store', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  cancelSessionForOwner: vi.fn(),
  claimExpiredWaitingBatch: vi.fn(),
  claimExpiredWaitingSession: vi.fn(),
  claimSessionForAgent: vi.fn(),
  closeIdleConnectedSessions: vi.fn(),
  getSessionForOwner: vi.fn(),
  insertHandoffSession: vi.fn(),
  listConnectedSessionsForAgent: mocks.listConnectedSessionsForAgent,
  listWaitingQueue: vi.fn(),
  purgeOldHandoffSessions: vi.fn(),
  recordEmailOutcome: vi.fn(),
}));

import { createError } from '@/lib/errors';
import { GET } from '../route';

function sessionRow(id: string) {
  return {
    id,
    reference_id: `REF-${id}`,
    surface: 'marketing',
    reason: 'user_requested',
    status: 'connected',
    contact_email: 'customer@example.com',
    summary: 'cannot sign in',
    transcript: [{ role: 'user', content: 'I cannot sign in', at: '2026-11-08T10:00:00.000Z' }],
    attempted_actions: [],
    citations: [],
    account_context: { signedIn: false, userId: null },
    agent_user_id: 'user_agent_1',
  };
}

function request() {
  return new Request('http://localhost/api/support/handoff/agent/active') as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.requirePlatformAdmin.mockResolvedValue({ userId: 'user_agent_1' });
});

describe('GET /api/support/handoff/agent/active', () => {
  it('hides the list from anyone who is not a platform admin', async () => {
    mocks.requirePlatformAdmin.mockRejectedValue(createError.notFound('Not found.'));

    const response = await GET(request());

    expect(response.status).toBe(404);
    expect(mocks.listConnectedSessionsForAgent).not.toHaveBeenCalled();
  });

  it("returns only the caller's connected sessions with the context needed to resume them", async () => {
    mocks.listConnectedSessionsForAgent.mockResolvedValue([sessionRow('a'), sessionRow('b')]);

    const response = await GET(request());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.listConnectedSessionsForAgent).toHaveBeenCalledWith('user_agent_1', 25);
    expect(payload.sessions.map((entry: { sessionId: string }) => entry.sessionId)).toEqual([
      'a',
      'b',
    ]);
    expect(payload.sessions[0].transcript[0].content).toBe('I cannot sign in');
    expect(payload.sessions[0].referenceId).toBe('REF-a');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});

type ImportedModule2 = typeof import('@/lib/rate-limit');
type ImportedModule1 = typeof import('@/lib/logger');
type ImportedModule0 = typeof import('@/lib/support/handoff/store');
