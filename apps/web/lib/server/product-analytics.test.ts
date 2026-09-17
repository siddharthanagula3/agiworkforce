import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  hasConsent: vi.fn(),
  query: vi.fn(),
  execute: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/consent-records', () => ({
  hasConsent: mocks.hasConsent,
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: mocks.query, execute: mocks.execute }),
}));
vi.mock('@/lib/free-chat-surface-policy', () => ({
  readSurfaceHint: () => null,
}));

import {
  isProductAnalyticsAllowed,
  recordProductAnalyticsEvents,
  trackAuditedProductEvent,
  trackMeteredCapability,
} from './product-analytics';

const SUBJECT = { userId: 'user_1', organizationId: null };
const OCCURRED_AT = '2026-09-17T00:00:00.000Z';

function event(name: string, outcome?: string) {
  return {
    name,
    surface: 'web',
    occurredAt: OCCURRED_AT,
    ...(outcome ? { outcome } : {}),
  } as never;
}

function insertedEvents(): string[] {
  return mocks.execute.mock.calls
    .map((call) => call[1] as unknown[])
    .map((params) => String(params[2]));
}

describe('the consent gate on the product event stream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockResolvedValue([]);
    mocks.execute.mockResolvedValue(1);
  });

  it('writes nothing when the consent ledger has no grant', async () => {
    mocks.hasConsent.mockResolvedValue(false);

    await expect(recordProductAnalyticsEvents(SUBJECT, [event('signup')])).resolves.toBe(0);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('writes nothing when the consent ledger cannot be read', async () => {
    mocks.hasConsent.mockRejectedValue(new Error('database is gone'));

    await expect(isProductAnalyticsAllowed('user_1')).resolves.toBe(false);
    await expect(recordProductAnalyticsEvents(SUBJECT, [event('signup')])).resolves.toBe(0);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('asks the ledger for the product analytics purpose, not a client flag', async () => {
    mocks.hasConsent.mockResolvedValue(true);

    await recordProductAnalyticsEvents(SUBJECT, [event('signup')]);

    expect(mocks.hasConsent).toHaveBeenCalledWith('user_1', 'product_analytics');
  });

  it('writes the granted batch', async () => {
    mocks.hasConsent.mockResolvedValue(true);

    await expect(
      recordProductAnalyticsEvents(SUBJECT, [event('signup'), event('project_created')]),
    ).resolves.toBe(2);
    expect(insertedEvents()).toEqual(['signup', 'project_created']);
  });
});

describe('the derived account milestones', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasConsent.mockResolvedValue(true);
    mocks.execute.mockResolvedValue(1);
  });

  it('records first chat and first useful response on a completed first answer', async () => {
    mocks.query.mockResolvedValue([]);

    await recordProductAnalyticsEvents(SUBJECT, [event('assistant_response', 'succeeded')]);

    expect(insertedEvents()).toEqual(['assistant_response', 'first_chat', 'first_useful_response']);
  });

  it('does not call an answer that failed a useful response', async () => {
    mocks.query.mockResolvedValue([]);

    await recordProductAnalyticsEvents(SUBJECT, [event('assistant_response', 'failed')]);

    expect(insertedEvents()).toEqual(['assistant_response', 'first_chat']);
  });

  it('activates only once the account has chatted and used a second capability', async () => {
    mocks.query.mockResolvedValue([
      { event_name: 'assistant_response' },
      { event_name: 'first_chat' },
      { event_name: 'first_useful_response' },
    ]);

    await recordProductAnalyticsEvents(SUBJECT, [event('project_created')]);

    expect(insertedEvents()).toEqual(['project_created', 'activation']);
  });

  it('costs no statement once every milestone is on the account', async () => {
    mocks.query.mockResolvedValue([
      { event_name: 'first_chat' },
      { event_name: 'first_useful_response' },
      { event_name: 'activation' },
    ]);

    await recordProductAnalyticsEvents(SUBJECT, [event('assistant_response', 'succeeded')]);

    expect(insertedEvents()).toEqual(['assistant_response']);
  });
});

describe('events derived from facts the product already records', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasConsent.mockResolvedValue(true);
    mocks.query.mockResolvedValue([{ event_name: 'first_chat' }]);
    mocks.execute.mockResolvedValue(1);
  });

  it('turns a metered chat turn into an assistant response on the surface it was served to', async () => {
    trackMeteredCapability({
      userId: 'user_1',
      capability: 'chat',
      surface: 'mobile',
      taskOutcome: 'delivered',
      provider: 'anthropic',
    });
    await vi.waitFor(() => expect(mocks.execute).toHaveBeenCalled());

    const params = mocks.execute.mock.calls[0]?.[1] as unknown[];
    expect(params[2]).toBe('assistant_response');
    expect(params[3]).toBe('mobile');
    expect(params[4]).toBe('succeeded');
  });

  it('drops a metered row whose surface is not one the contract names', async () => {
    trackMeteredCapability({
      userId: 'user_1',
      capability: 'chat',
      surface: 'managed-video',
      taskOutcome: 'delivered',
    });

    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('ignores a capability with no product meaning', async () => {
    trackMeteredCapability({ userId: 'user_1', capability: 'egress', surface: 'web' });

    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('turns an audited plan change into a plan_changed event carrying both tiers', async () => {
    trackAuditedProductEvent({
      userId: 'user_1',
      eventType: 'plan_changed',
      detail: { planTier: 'pro', previousPlanTier: 'free', source: 'stripe_webhook' },
    });
    await vi.waitFor(() => expect(mocks.execute).toHaveBeenCalled());

    const params = mocks.execute.mock.calls[0]?.[1] as unknown[];
    expect(params[2]).toBe('plan_changed');
    expect(JSON.parse(String(params[5]))).toEqual({
      planTier: 'pro',
      previousPlanTier: 'free',
      source: 'stripe_webhook',
    });
  });

  it('carries the audit outcome onto an event whose rate needs one', async () => {
    trackAuditedProductEvent({
      userId: 'user_1',
      eventType: 'computer_use_action',
      outcome: 'failure',
      detail: {},
    });
    await vi.waitFor(() => expect(mocks.execute).toHaveBeenCalled());

    const params = mocks.execute.mock.calls[0]?.[1] as unknown[];
    expect(params[2]).toBe('remote_action_finished');
    expect(params[4]).toBe('failed');
  });

  it('ignores an audit event that is not a product event', async () => {
    trackAuditedProductEvent({ userId: 'user_1', eventType: 'login', detail: {} });

    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
