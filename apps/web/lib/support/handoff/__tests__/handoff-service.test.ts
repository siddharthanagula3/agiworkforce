import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storeMocks = vi.hoisted(() => ({
  listFreshOnlineAgents: vi.fn(),
  insertHandoffSession: vi.fn(),
  getSessionForOwner: vi.fn(),
  getSessionById: vi.fn(),
  claimExpiredWaitingSession: vi.fn(),
  claimExpiredWaitingBatch: vi.fn(),
  claimSessionForAgent: vi.fn(),
  cancelSessionForOwner: vi.fn(),
  recordEmailOutcome: vi.fn(),
  listWaitingQueue: vi.fn(),
  closeIdleConnectedSessions: vi.fn(),
  purgeOldHandoffSessions: vi.fn(),
  appendHandoffMessage: vi.fn(),
  listHandoffMessages: vi.fn(),
}));

const accountMocks = vi.hoisted(() => ({
  getSubscription: vi.fn(),
  getManagedUsageSummary: vi.fn(),
}));

vi.mock('@/lib/support/handoff/store', () => storeMocks);
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: accountMocks.getSubscription },
}));
vi.mock('@/lib/services/managed-usage-summary-service', () => ({
  getManagedUsageSummary: accountMocks.getManagedUsageSummary,
}));

import {
  escalateToHuman,
  getHandoffStatusForOwner,
  sweepExpiredHandoffs,
} from '../handoff-service';
import { clearAvailabilityCache } from '../presence-service';
import { REFERENCE_ID_PATTERN } from '../reference-id';

const fetchMock = vi.fn();

function echoInsert() {
  storeMocks.insertHandoffSession.mockImplementation(async (input: Record<string, unknown>) => ({
    id: 'session-uuid-1',
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
    page_path: input['pagePath'],
    locale: input['locale'],
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
}

function baseInput() {
  return {
    surface: 'marketing' as const,
    reason: 'hard_abstain' as const,
    summary: 'User asked why their invoice doubled; the agent hard-abstained on billing.',
    transcript: [
      {
        role: 'user' as const,
        content: 'Why did my invoice double?',
        at: '2026-08-05T10:00:00.000Z',
      },
      {
        role: 'assistant' as const,
        content: "I won't guess about billing. Let me get you a person.",
        at: '2026-08-05T10:00:02.000Z',
      },
    ],
    attemptedActions: [
      {
        action: 'open_billing_portal',
        outcome: 'refused' as const,
        detail: 'Billing is a hard-abstain category',
        at: '2026-08-05T10:00:03.000Z',
      },
    ],
    citations: [{ title: 'Refund policy', url: 'https://agiworkforce.com/refund-policy' }],
    contactEmail: 'customer@example.com',
    ownerDb: null,
    ownerUserId: null,
    ownerSessionKey: 'anon-abc',
    verifiedEmail: null,
  };
}

function lastEmailBody(): Record<string, unknown> {
  const call = fetchMock.mock.calls.at(-1);
  return JSON.parse(String((call?.[1] as { body?: string } | undefined)?.body ?? '{}'));
}

beforeEach(() => {
  vi.clearAllMocks();
  clearAvailabilityCache();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ id: 'resend-message-1' }),
    text: async () => '',
  });
  vi.stubEnv('RESEND_API_KEY', 're_test_key');
  vi.stubEnv('AGI_SUPPORT_FALLBACK_EMAIL', 'support@agiworkforce.com');
  vi.stubEnv('AGI_SUPPORT_FROM_EMAIL', 'support@agiworkforce.com');
  accountMocks.getSubscription.mockResolvedValue(null);
  accountMocks.getManagedUsageSummary.mockResolvedValue(null);
  storeMocks.recordEmailOutcome.mockResolvedValue(undefined);
  echoInsert();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('escalateToHuman · nobody available (the common case)', () => {
  beforeEach(() => {
    vi.stubEnv('AGI_SUPPORT_LIVE_HANDOFF_ENABLED', '');
    storeMocks.listFreshOnlineAgents.mockResolvedValue([]);
  });

  it('emails the transcript and NEVER returns a connecting/waiting state', async () => {
    const result = await escalateToHuman(baseInput());

    expect(result.mode).toBe('email');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.resend.com/emails');

    const serialized = JSON.stringify(result).toLowerCase();
    expect(serialized).not.toContain('connecting');
    expect(serialized).not.toContain('"status":"waiting"');
    expect(result).not.toHaveProperty('sessionId');

    expect(result.headline).toBe('No one is available right now');
    if (result.mode !== 'email') throw new Error('expected the email fallback');
    expect(result.emailedTo).toBe('support@agiworkforce.com');
    expect(result.expectedReply).toBe('within one business day');
    expect(result.nextStep.label.length).toBeGreaterThan(0);
  });

  it('returns a reference id that matches what was persisted', async () => {
    const result = await escalateToHuman(baseInput());

    expect(result.referenceId).toMatch(REFERENCE_ID_PATTERN);
    expect(storeMocks.insertHandoffSession).toHaveBeenCalledWith(
      expect.objectContaining({ referenceId: result.referenceId, status: 'emailed' }),
    );
    expect(result.detail).toContain(result.referenceId);
  });

  it('carries the transcript, what the agent already tried, and the account context into the email', async () => {
    accountMocks.getSubscription.mockResolvedValue({
      plan_tier: 'pro',
      status: 'active',
      current_period_end: new Date('2026-09-01T00:00:00.000Z'),
    });
    accountMocks.getManagedUsageSummary.mockResolvedValue({
      plan_tier: 'pro',
      usage_percentage: 42,
      usage_reset_at: '2026-09-01T00:00:00.000Z',
      has_usage_remaining: true,
      subscription_status: 'active',
    });

    const result = await escalateToHuman({
      ...baseInput(),
      ownerDb: { query: vi.fn(), execute: vi.fn(), transaction: vi.fn() } as never,
      ownerUserId: 'user_123',
      verifiedEmail: 'verified@example.com',
    });

    const body = lastEmailBody();
    const text = String(body['text']);

    expect(text).toContain('Why did my invoice double?');
    expect(text).toContain("I won't guess about billing.");
    expect(text).toContain('open_billing_portal → refused');
    expect(text).toContain('Billing is a hard-abstain category');
    expect(text).toContain('https://agiworkforce.com/refund-policy');
    expect(text).toContain('Plan: pro');
    expect(text).toContain('Subscription status: active');
    expect(text).toContain('Usage: 42%');
    expect(text).toContain(result.referenceId);
    expect(body['reply_to']).toEqual(['verified@example.com']);
    expect(String(body['subject'])).toContain(result.referenceId);
  });

  it('redacts secrets before they reach either the database or the inbox', async () => {
    const secret = `sk-${'a'.repeat(48)}`;
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0';

    await escalateToHuman({
      ...baseInput(),
      transcript: [
        {
          role: 'user',
          content: `my key is ${secret} and my token is ${jwt}`,
          at: '2026-08-05T10:00:00.000Z',
        },
      ],
    });

    const persisted = JSON.stringify(storeMocks.insertHandoffSession.mock.calls[0]?.[0]);
    expect(persisted).not.toContain(secret);
    expect(persisted).not.toContain(jwt);
    expect(persisted).toContain('[redacted:api-key]');

    const emailed = JSON.stringify(lastEmailBody());
    expect(emailed).not.toContain(secret);
    expect(emailed).not.toContain(jwt);
  });

  it('degrades honestly, and still returns a reference id, when the provider is unconfigured', async () => {
    vi.stubEnv('RESEND_API_KEY', '');

    const result = await escalateToHuman(baseInput());

    expect(result.mode).toBe('unavailable');
    expect(result.referenceId).toMatch(REFERENCE_ID_PATTERN);
    expect(fetchMock).not.toHaveBeenCalled();
    if (result.mode !== 'unavailable') throw new Error('expected the degraded mode');
    expect(result.detail).toContain('nothing');
    expect(result.mailtoHref).toContain('mailto:support@agiworkforce.com');
    expect(result.mailtoHref).toContain(encodeURIComponent(result.referenceId));
    expect(storeMocks.recordEmailOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'undeliverable' }),
    );
  });

  it('degrades honestly when the provider rejects the send', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({}),
      text: async () => 'domain not verified',
    });

    const result = await escalateToHuman(baseInput());

    expect(result.mode).toBe('unavailable');
    expect(JSON.stringify(result).toLowerCase()).not.toContain('connecting');
    expect(storeMocks.recordEmailOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'undeliverable' }),
    );
  });

  it('refuses to escalate a signed-out user with no contact address', async () => {
    const input = baseInput();
    delete (input as { contactEmail?: string }).contactEmail;

    await expect(escalateToHuman(input)).rejects.toThrow(/contact email is required/i);
    expect(storeMocks.insertHandoffSession).not.toHaveBeenCalled();
  });
});

describe('escalateToHuman · a human IS available', () => {
  beforeEach(() => {
    vi.stubEnv('AGI_SUPPORT_LIVE_HANDOFF_ENABLED', '1');
    vi.stubEnv('AGI_SUPPORT_HANDOFF_WAIT_TIMEOUT_SECONDS', '120');
    storeMocks.listFreshOnlineAgents.mockResolvedValue([
      {
        agent_user_id: 'user_agent_1',
        display_name: 'Sam',
        status: 'online',
        max_concurrent_sessions: 3,
        last_heartbeat_at: new Date().toISOString(),
        active_sessions: 0,
      },
    ]);
  });

  it('returns a live wait that ALWAYS carries a future deadline and a persisted session', async () => {
    const result = await escalateToHuman(baseInput());

    expect(result.mode).toBe('live');
    if (result.mode !== 'live') throw new Error('expected live');
    expect(result.sessionId).toBe('session-uuid-1');
    expect(new Date(result.waitExpiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(result.onTimeout).toBe('email_fallback');
    expect(result.nextStep.kind).toBe('wait');
    expect(storeMocks.insertHandoffSession).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'waiting', waitExpiresAt: result.waitExpiresAt }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('re-checks availability at write time, so a stale client read cannot manufacture a live wait', async () => {
    storeMocks.listFreshOnlineAgents.mockResolvedValue([]);

    const result = await escalateToHuman(baseInput());

    expect(result.mode).toBe('email');
    expect(storeMocks.insertHandoffSession).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'emailed', waitExpiresAt: null }),
    );
  });
});

describe('the waiting state cannot outlive its deadline', () => {
  const expiredRow = {
    id: 'session-uuid-1',
    reference_id: 'AGI-20260805-ABCDEFGH',
    owner_user_id: null,
    owner_session_key: 'anon-abc',
    surface: 'marketing' as const,
    reason: 'user_requested' as const,
    status: 'waiting' as const,
    contact_email: 'customer@example.com',
    summary: 'needs a person',
    transcript: [{ role: 'user' as const, content: 'hello', at: '2026-08-05T10:00:00.000Z' }],
    attempted_actions: [],
    citations: [],
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
    wait_expires_at: new Date(Date.now() - 60_000).toISOString(),
    connected_at: null,
    last_activity_at: new Date().toISOString(),
    closed_at: null,
    email_sent_at: null,
    email_provider_message_id: null,
    email_error: null,
    created_at: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.stubEnv('AGI_SUPPORT_LIVE_HANDOFF_ENABLED', '1');
  });

  it('converts an expired wait to an emailed escalation on poll', async () => {
    storeMocks.getSessionForOwner
      .mockResolvedValueOnce(expiredRow)
      .mockResolvedValue({ ...expiredRow, status: 'timed_out_emailed' });
    storeMocks.claimExpiredWaitingSession.mockResolvedValue(expiredRow);

    const status = await getHandoffStatusForOwner('session-uuid-1', 'anon-abc');

    expect(status?.status).toBe('timed_out_emailed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(lastEmailBody()['text'])).toContain(
      'Nobody picked it up before the wait deadline',
    );
    expect(status?.headline).toBe('Nobody picked up, so I emailed it instead');
    expect(status?.nextStep.kind).toBe('email_sent');
    expect(status).not.toHaveProperty('waitExpiresAt');
  });

  it('is single-flight: a second concurrent poll sends NO second email', async () => {
    storeMocks.getSessionForOwner
      .mockResolvedValueOnce(expiredRow)
      .mockResolvedValue({ ...expiredRow, status: 'timed_out_emailed' });
    storeMocks.claimExpiredWaitingSession.mockResolvedValue(null);

    const status = await getHandoffStatusForOwner('session-uuid-1', 'anon-abc');

    expect(status?.status).toBe('timed_out_emailed');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null (⇒ 404) for someone else’s session id', async () => {
    storeMocks.getSessionForOwner.mockResolvedValue(null);

    const status = await getHandoffStatusForOwner('session-uuid-1', 'anon-someone-else');

    expect(status).toBeNull();
    expect(storeMocks.getSessionForOwner).toHaveBeenCalledWith(
      'session-uuid-1',
      'anon-someone-else',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('the cron sweep emails an expired wait whose owner never came back', async () => {
    storeMocks.claimExpiredWaitingBatch.mockResolvedValue([expiredRow]);
    storeMocks.closeIdleConnectedSessions.mockResolvedValue(2);
    storeMocks.purgeOldHandoffSessions.mockResolvedValue(7);

    const summary = await sweepExpiredHandoffs();

    expect(summary).toEqual({ expiredEmailed: 1, idleClosed: 2, purged: 7 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(lastEmailBody()['text'])).toContain('AGI-20260805-ABCDEFGH');
    expect(storeMocks.recordEmailOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-uuid-1', status: 'timed_out_emailed' }),
    );
  });
});
