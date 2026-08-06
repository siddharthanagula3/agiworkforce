/**
 * Status polling, cancellation, and the human-agent side.
 *
 * The properties under test are the ones that would let the widget lie or leak:
 *   - a session id belonging to someone else is 404, not 403, and returns nothing;
 *   - the expired-wait transition happens on poll and is single-flight;
 *   - two agents cannot claim one user;
 *   - the claim response actually carries the context so the user does not repeat
 *     themselves;
 *   - the agent surface is admin-gated.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getOrCreateAnonSession: vi.fn(),
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  requireAdmin: vi.fn(),
  getSessionForOwner: vi.fn(),
  getSessionById: vi.fn(),
  claimExpiredWaitingSession: vi.fn(),
  claimSessionForAgent: vi.fn(),
  cancelSessionForOwner: vi.fn(),
  listWaitingQueue: vi.fn(),
  recordEmailOutcome: vi.fn(),
  appendHandoffMessage: vi.fn(),
  listFreshOnlineAgents: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: mocks.requireCsrfToken,
  getOrCreateAnonSession: mocks.getOrCreateAnonSession,
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/auth-guards', () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/support/handoff/store', () => ({
  getSessionForOwner: mocks.getSessionForOwner,
  getSessionById: mocks.getSessionById,
  claimExpiredWaitingSession: mocks.claimExpiredWaitingSession,
  claimSessionForAgent: mocks.claimSessionForAgent,
  cancelSessionForOwner: mocks.cancelSessionForOwner,
  listWaitingQueue: mocks.listWaitingQueue,
  recordEmailOutcome: mocks.recordEmailOutcome,
  appendHandoffMessage: mocks.appendHandoffMessage,
  listFreshOnlineAgents: mocks.listFreshOnlineAgents,
  claimExpiredWaitingBatch: vi.fn(),
  closeIdleConnectedSessions: vi.fn(),
  purgeOldHandoffSessions: vi.fn(),
  insertHandoffSession: vi.fn(),
  listHandoffMessages: vi.fn(),
  upsertAgentPresence: vi.fn(),
}));

import { createError } from '@/lib/errors';
import { DELETE, GET } from '../[sessionId]/route';
import { POST as CLAIM } from '../agent/[sessionId]/claim/route';
import { GET as QUEUE } from '../agent/queue/route';

const fetchMock = vi.fn();

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    reference_id: 'AGI-20260805-ABCDEFGH',
    owner_user_id: null,
    owner_session_key: 'anon-owner',
    surface: 'marketing',
    reason: 'user_requested',
    status: 'waiting',
    contact_email: 'customer@example.com',
    summary: 'cannot sign in',
    transcript: [{ role: 'user', content: 'I cannot sign in', at: '2026-08-05T10:00:00.000Z' }],
    attempted_actions: [
      { action: 'resend_verification_email', outcome: 'refused', at: '2026-08-05T10:00:01.000Z' },
    ],
    citations: [{ title: 'Sign in help', url: 'https://agiworkforce.com/help' }],
    account_context: {
      signedIn: false,
      userId: null,
      planTier: null,
      subscriptionStatus: null,
      currentPeriodEnd: null,
      usagePercentage: null,
      usageResetAt: null,
      hasUsageRemaining: null,
    },
    page_path: null,
    locale: null,
    agent_user_id: null,
    wait_expires_at: new Date(Date.now() + 60_000).toISOString(),
    connected_at: null,
    last_activity_at: new Date().toISOString(),
    closed_at: null,
    email_sent_at: null,
    email_provider_message_id: null,
    email_error: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function req(url: string, method = 'GET') {
  return new Request(url, { method }) as never;
}

const ctx = { params: Promise.resolve({ sessionId: 'session-1' }) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ id: 'resend-1' }),
    text: async () => '',
  });
  vi.stubEnv('RESEND_API_KEY', 're_test_key');
  mocks.requireCsrfToken.mockResolvedValue(null);
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.auth.mockResolvedValue({ userId: null });
  mocks.getOrCreateAnonSession.mockResolvedValue({ id: 'anon-owner' });
  mocks.requireAdmin.mockResolvedValue({ userId: 'user_agent_1' });
  mocks.recordEmailOutcome.mockResolvedValue(undefined);
  mocks.appendHandoffMessage.mockResolvedValue({
    seq: 1,
    author: 'system',
    body: 'joined',
    created_at: new Date().toISOString(),
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('GET /api/support/handoff/[sessionId]', () => {
  it('returns the waiting state WITH its deadline', async () => {
    mocks.getSessionForOwner.mockResolvedValue(sessionRow());

    const response = await GET(req('http://localhost/api/support/handoff/session-1'), ctx);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe('waiting');
    // A waiting state without a deadline is the bug; assert it is always present.
    expect(new Date(payload.waitExpiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(payload.nextStep.kind).toBe('wait');
  });

  it('404s another owner’s session and leaks nothing', async () => {
    // The store returns nothing because the ownership predicate did not match.
    mocks.getSessionForOwner.mockResolvedValue(null);

    const response = await GET(req('http://localhost/api/support/handoff/session-1'), ctx);

    expect(response.status).toBe(404);
    const body = await response.text();
    expect(body).not.toContain('AGI-20260805');
    expect(body).not.toContain('customer@example.com');
    // Ownership was applied as a query predicate, not a post-load comparison.
    expect(mocks.getSessionForOwner).toHaveBeenCalledWith('session-1', 'anon-owner');
  });

  it('converts an expired wait into a sent email during the poll', async () => {
    const expired = sessionRow({ wait_expires_at: new Date(Date.now() - 1_000).toISOString() });
    mocks.getSessionForOwner
      .mockResolvedValueOnce(expired)
      .mockResolvedValue({ ...expired, status: 'timed_out_emailed' });
    mocks.claimExpiredWaitingSession.mockResolvedValue(expired);

    const response = await GET(req('http://localhost/api/support/handoff/session-1'), ctx);
    const payload = await response.json();

    expect(payload.status).toBe('timed_out_emailed');
    expect(payload.waitExpiresAt).toBeUndefined();
    expect(payload.nextStep.kind).toBe('email_sent');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends no second email when another poll already won the transition', async () => {
    const expired = sessionRow({ wait_expires_at: new Date(Date.now() - 1_000).toISOString() });
    mocks.getSessionForOwner
      .mockResolvedValueOnce(expired)
      .mockResolvedValue({ ...expired, status: 'timed_out_emailed' });
    mocks.claimExpiredWaitingSession.mockResolvedValue(null);

    const response = await GET(req('http://localhost/api/support/handoff/session-1'), ctx);

    expect((await response.json()).status).toBe('timed_out_emailed');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/support/handoff/[sessionId]', () => {
  it('lets the owner give up, and always leaves a next step', async () => {
    mocks.cancelSessionForOwner.mockResolvedValue(sessionRow({ status: 'cancelled' }));

    const response = await DELETE(
      req('http://localhost/api/support/handoff/session-1', 'DELETE'),
      ctx,
    );
    const payload = await response.json();

    expect(payload.status).toBe('cancelled');
    expect(payload.nextStep.label.length).toBeGreaterThan(0);
    expect(mocks.cancelSessionForOwner).toHaveBeenCalledWith('session-1', 'anon-owner');
  });

  it('404s a cancel for a session the caller does not own', async () => {
    mocks.cancelSessionForOwner.mockResolvedValue(null);

    const response = await DELETE(
      req('http://localhost/api/support/handoff/session-1', 'DELETE'),
      ctx,
    );
    expect(response.status).toBe(404);
  });
});

describe('agent surface', () => {
  it('requires admin for the queue', async () => {
    mocks.requireAdmin.mockRejectedValue(createError.forbidden('Admin privileges required'));

    const response = await QUEUE(req('http://localhost/api/support/handoff/agent/queue'));
    expect(response.status).toBe(403);
    expect(mocks.listWaitingQueue).not.toHaveBeenCalled();
  });

  it('returns queue metadata only — no transcripts for a browsing admin', async () => {
    mocks.listWaitingQueue.mockResolvedValue([sessionRow()]);

    const response = await QUEUE(req('http://localhost/api/support/handoff/agent/queue'));
    const payload = await response.json();

    expect(payload.queue).toHaveLength(1);
    expect(payload.queue[0].referenceId).toBe('AGI-20260805-ABCDEFGH');
    expect(JSON.stringify(payload)).not.toContain('I cannot sign in');
    expect(JSON.stringify(payload)).not.toContain('customer@example.com');
  });

  it('claiming hands the human the whole context so the user never repeats themselves', async () => {
    mocks.claimSessionForAgent.mockResolvedValue(
      sessionRow({ status: 'connected', agent_user_id: 'user_agent_1' }),
    );

    const response = await CLAIM(
      req('http://localhost/api/support/handoff/agent/session-1/claim', 'POST'),
      ctx,
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe('connected');
    expect(payload.transcript[0].content).toBe('I cannot sign in');
    expect(payload.attemptedActions[0].action).toBe('resend_verification_email');
    expect(payload.citations[0].url).toBe('https://agiworkforce.com/help');
    expect(payload.accountContext).toBeDefined();
    // The user is told a person arrived, inside the stream they are polling.
    expect(mocks.appendHandoffMessage).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-1', author: 'system' }),
    );
  });

  it('409s the loser of a claim race so two agents never talk to one user', async () => {
    mocks.claimSessionForAgent.mockResolvedValue(null);
    mocks.getSessionById.mockResolvedValue(
      sessionRow({ status: 'connected', agent_user_id: 'user_agent_2' }),
    );

    const response = await CLAIM(
      req('http://localhost/api/support/handoff/agent/session-1/claim', 'POST'),
      ctx,
    );

    expect(response.status).toBe(409);
    expect(mocks.appendHandoffMessage).not.toHaveBeenCalled();
  });

  it('refuses to claim a wait that has already passed its deadline', async () => {
    mocks.claimSessionForAgent.mockResolvedValue(null);
    mocks.getSessionById.mockResolvedValue(
      sessionRow({ wait_expires_at: new Date(Date.now() - 1_000).toISOString() }),
    );

    const response = await CLAIM(
      req('http://localhost/api/support/handoff/agent/session-1/claim', 'POST'),
      ctx,
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error.message).toMatch(/wait deadline/i);
  });
});
