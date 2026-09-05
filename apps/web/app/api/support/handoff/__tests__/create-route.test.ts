import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const routeMocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getOrCreateAnonSession: vi.fn(),
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  insertHandoffSession: vi.fn(),
  listFreshOnlineAgents: vi.fn(),
  recordEmailOutcome: vi.fn(),
  getSubscription: vi.fn(),
  getManagedUsageSummary: vi.fn(),
  requireHumanCaller: vi.fn(),
  getCurrentUserRlsDb: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: routeMocks.auth }));
vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: routeMocks.requireCsrfToken,
  getOrCreateAnonSession: routeMocks.getOrCreateAnonSession,
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: routeMocks.withRateLimit }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/support/handoff/store', () => ({
  insertHandoffSession: routeMocks.insertHandoffSession,
  listFreshOnlineAgents: routeMocks.listFreshOnlineAgents,
  recordEmailOutcome: routeMocks.recordEmailOutcome,
}));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: routeMocks.getSubscription },
}));
vi.mock('@/lib/services/managed-usage-summary-service', () => ({
  getManagedUsageSummary: routeMocks.getManagedUsageSummary,
}));
vi.mock('@/lib/security/bot-challenge', () => ({
  requireHumanCaller: routeMocks.requireHumanCaller,
}));
vi.mock('@/lib/server/rls-db', () => ({
  getCurrentUserRlsDb: routeMocks.getCurrentUserRlsDb,
}));

import { createError } from '@/lib/errors';
import { BOT_CHALLENGED_ENDPOINTS } from '@/lib/security/bot-challenge-routes';
import { POST } from '../route';
import { clearAvailabilityCache } from '@/lib/support/handoff/presence-service';
import { REFERENCE_ID_PATTERN } from '@/lib/support/handoff/reference-id';

const fetchMock = vi.fn();

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost:3000/api/support/handoff', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }) as never;
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    surface: 'marketing',
    reason: 'user_requested',
    summary: 'Cannot sign in with my work email',
    transcript: [{ role: 'user', content: 'I cannot sign in', at: '2026-08-05T10:00:00.000Z' }],
    contactEmail: 'customer@example.com',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clearAvailabilityCache();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ id: 'resend-1' }),
    text: async () => '',
  });
  vi.stubEnv('RESEND_API_KEY', 're_test_key');
  vi.stubEnv('AGI_SUPPORT_LIVE_HANDOFF_ENABLED', '');
  routeMocks.requireCsrfToken.mockResolvedValue(null);
  routeMocks.withRateLimit.mockResolvedValue(null);
  routeMocks.auth.mockResolvedValue({ userId: null });
  routeMocks.getCurrentUserRlsDb.mockResolvedValue(null);
  routeMocks.getOrCreateAnonSession.mockResolvedValue({ id: 'anon-xyz' });
  routeMocks.listFreshOnlineAgents.mockResolvedValue([]);
  routeMocks.recordEmailOutcome.mockResolvedValue(undefined);
  routeMocks.getSubscription.mockResolvedValue(null);
  routeMocks.getManagedUsageSummary.mockResolvedValue(null);
  routeMocks.requireHumanCaller.mockResolvedValue(undefined);
  routeMocks.insertHandoffSession.mockImplementation(async (input: Record<string, unknown>) => ({
    id: 'session-1',
    reference_id: input['referenceId'],
    owner_user_id: input['ownerUserId'],
    owner_session_key: input['ownerSessionKey'],
    surface: input['surface'],
    reason: input['reason'],
    status: input['status'],
    contact_email: input['contactEmail'],
    summary: input['summary'],
    transcript: input['transcript'],
    attempted_actions: input['attemptedActions'],
    citations: input['citations'],
    account_context: input['accountContext'],
    page_path: null,
    locale: null,
    agent_user_id: null,
    wait_expires_at: input['waitExpiresAt'],
    connected_at: null,
    last_activity_at: new Date().toISOString(),
    closed_at: null,
    email_sent_at: null,
    email_provider_message_id: null,
    email_error: null,
    created_at: new Date().toISOString(),
  }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('POST /api/support/handoff', () => {
  it('with nobody available, returns the email fallback with a reference id and no connecting state', async () => {
    const response = await POST(request(validBody()));
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.mode).toBe('email');
    expect(payload.referenceId).toMatch(REFERENCE_ID_PATTERN);
    expect(payload.headline).toBe('No one is available right now');
    expect(JSON.stringify(payload).toLowerCase()).not.toContain('connecting');
    expect(payload.sessionId).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('takes the owner key from the session, never from the body', async () => {
    await POST(
      request(
        validBody({
          ownerSessionKey: 'anon-attacker-chosen',
          ownerUserId: 'user_victim',
        }),
      ),
    );

    expect(routeMocks.insertHandoffSession).toHaveBeenCalledWith(
      expect.objectContaining({ ownerSessionKey: 'anon-xyz', ownerUserId: null }),
    );
  });

  it('ignores a client-supplied contactEmail when the caller is signed in', async () => {
    routeMocks.auth.mockResolvedValue({ userId: 'user_real' });
    await POST(request(validBody({ contactEmail: 'attacker@example.com' })));

    expect(routeMocks.insertHandoffSession).toHaveBeenCalledWith(
      expect.objectContaining({ ownerUserId: 'user_real', ownerSessionKey: 'user_real' }),
    );
    expect(routeMocks.getOrCreateAnonSession).not.toHaveBeenCalled();
  });

  it('400s a signed-out escalation with no contact address instead of silently dropping it', async () => {
    const body = validBody();
    delete (body as { contactEmail?: string }).contactEmail;

    const response = await POST(request(body));

    expect(response.status).toBe(400);
    expect(routeMocks.insertHandoffSession).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('400s an invalid payload', async () => {
    const response = await POST(request({ surface: 'moon', reason: 'because' }));
    expect(response.status).toBe(400);
    expect(routeMocks.insertHandoffSession).not.toHaveBeenCalled();
  });

  it('honours the CSRF guard before doing anything', async () => {
    routeMocks.requireCsrfToken.mockResolvedValue(
      new Response('csrf', { status: 403 }) as unknown as never,
    );

    const response = await POST(request(validBody()));

    expect(response.status).toBe(403);
    expect(routeMocks.insertHandoffSession).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('honours the rate limit before persisting or emailing', async () => {
    routeMocks.withRateLimit.mockResolvedValue(
      new Response('slow down', { status: 429 }) as unknown as never,
    );

    const response = await POST(request(validBody()));

    expect(response.status).toBe(429);
    expect(routeMocks.insertHandoffSession).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('challenges the caller before persisting or emailing an escalation', async () => {
    routeMocks.requireHumanCaller.mockRejectedValue(createError.forbidden());

    const response = await POST(request(validBody()));

    expect(response.status).toBe(403);
    expect(routeMocks.requireHumanCaller).toHaveBeenCalledWith(
      BOT_CHALLENGED_ENDPOINTS.supportHandoffCreate,
    );
    expect(routeMocks.insertHandoffSession).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('persists the anon-session cookie so a signed-out session can be polled at all', async () => {
    routeMocks.getOrCreateAnonSession.mockResolvedValue({
      id: 'anon-new',
      newCookie: '__Host-anon-session-id=anon-new; Path=/; HttpOnly; SameSite=Strict; Secure',
    });

    const response = await POST(request(validBody()));

    expect(response.headers.get('set-cookie')).toContain('__Host-anon-session-id=anon-new');
  });
});
