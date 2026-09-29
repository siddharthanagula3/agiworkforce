import { describe, expect, it } from 'vitest';

import {
  PRODUCT_ANALYTICS_CONSENT_PATH,
  PRODUCT_ANALYTICS_CONSENT_PURPOSE,
  PRODUCT_ANALYTICS_EVENT_NAMES,
  PRODUCT_ANALYTICS_INGEST_PATH,
  PRODUCT_ANALYTICS_MAX_BATCH,
  PRODUCT_ANALYTICS_NOTICE_VERSION,
  PRODUCT_ANALYTICS_OUTCOME_EVENTS,
  PRODUCT_METRIC_KEYS,
  coversProductAnalytics,
  createAccountProductAnalytics,
  createProductAnalyticsEmitter,
  normalizeProductAnalyticsEvent,
  readProductAnalyticsConsent,
  requiresProductAnalyticsOutcome,
  type ProductAnalyticsEvent,
} from '../product-analytics';

const OCCURRED_AT = '2026-09-17T00:00:00.000Z';

describe('product analytics event contract', () => {
  it('names every checklist event exactly once', () => {
    expect(new Set(PRODUCT_ANALYTICS_EVENT_NAMES).size).toBe(PRODUCT_ANALYTICS_EVENT_NAMES.length);
    for (const name of ['signup', 'activation', 'first_chat', 'plan_changed'] as const) {
      expect(PRODUCT_ANALYTICS_EVENT_NAMES).toContain(name);
    }
  });

  it('names every metric exactly once', () => {
    expect(new Set(PRODUCT_METRIC_KEYS).size).toBe(PRODUCT_METRIC_KEYS.length);
  });

  it('refuses an unknown event name and an unknown surface', () => {
    expect(
      normalizeProductAnalyticsEvent({ name: 'nope', surface: 'web', occurredAt: OCCURRED_AT }),
    ).toBeNull();
    expect(
      normalizeProductAnalyticsEvent({ name: 'signup', surface: 'fax', occurredAt: OCCURRED_AT }),
    ).toBeNull();
  });

  it('refuses an outcome event with no outcome, so a rate keeps its numerator', () => {
    for (const name of PRODUCT_ANALYTICS_OUTCOME_EVENTS) {
      expect(requiresProductAnalyticsOutcome(name)).toBe(true);
      expect(
        normalizeProductAnalyticsEvent({ name, surface: 'web', occurredAt: OCCURRED_AT }),
      ).toBeNull();
    }
  });

  it('drops a property the contract does not allow and truncates the ones it does', () => {
    const event = normalizeProductAnalyticsEvent({
      name: 'tool_call',
      surface: 'cli',
      occurredAt: OCCURRED_AT,
      outcome: 'failed',
      properties: { toolName: 'x'.repeat(400), prompt: 'my secret question', attempt: 2 },
    });

    expect(event?.properties).toEqual({ toolName: 'x'.repeat(120), attempt: 2 });
    expect(event?.properties).not.toHaveProperty('prompt');
  });

  it('refuses a timestamp that is not a time', () => {
    expect(
      normalizeProductAnalyticsEvent({ name: 'signup', surface: 'web', occurredAt: 'yesterday' }),
    ).toBeNull();
  });
});

describe('the emitter every surface shares', () => {
  function collector() {
    const sent: ProductAnalyticsEvent[][] = [];
    return {
      sent,
      send: (events: readonly ProductAnalyticsEvent[]) => void sent.push([...events]),
    };
  }

  it('collects nothing while consent is withheld', async () => {
    const { sent, send } = collector();
    const emitter = createProductAnalyticsEmitter({ surface: 'web', send, isAllowed: () => false });

    emitter.track('signup');
    await emitter.flush();

    expect(emitter.pending()).toBe(0);
    expect(sent).toEqual([]);
  });

  it('re-asks at flush, so consent withdrawn after a queue never reaches the wire', async () => {
    const { sent, send } = collector();
    let allowed = true;
    const emitter = createProductAnalyticsEmitter({
      surface: 'desktop',
      send,
      isAllowed: () => allowed,
    });

    emitter.track('project_created');
    expect(emitter.pending()).toBe(1);
    allowed = false;
    await emitter.flush();

    expect(sent).toEqual([]);
    expect(emitter.pending()).toBe(0);
  });

  it('stamps the surface it was built for and sends the batch it queued', async () => {
    const { sent, send } = collector();
    const emitter = createProductAnalyticsEmitter({
      surface: 'vscode',
      send,
      isAllowed: () => true,
      now: () => Date.parse(OCCURRED_AT),
    });

    emitter.track('code_session_started');
    await emitter.flush();

    expect(sent).toEqual([
      [{ name: 'code_session_started', surface: 'vscode', occurredAt: OCCURRED_AT }],
    ]);
  });

  it('never queues more than the batch the ingest accepts', () => {
    const { send } = collector();
    const emitter = createProductAnalyticsEmitter({
      surface: 'mobile',
      send,
      isAllowed: () => true,
      batchSize: PRODUCT_ANALYTICS_MAX_BATCH * 4,
    });

    for (let index = 0; index < PRODUCT_ANALYTICS_MAX_BATCH + 5; index += 1) {
      emitter.track('assistant_response', { outcome: 'succeeded' });
    }

    expect(emitter.pending()).toBeLessThanOrEqual(PRODUCT_ANALYTICS_MAX_BATCH);
  });
});

describe('consent under the analytics notice', () => {
  function consents(noticeVersion: string) {
    return {
      consents: [{ purpose: PRODUCT_ANALYTICS_CONSENT_PURPOSE, granted: true, noticeVersion }],
    };
  }

  it('is its own identifier, not a privacy notice date', () => {
    expect(PRODUCT_ANALYTICS_NOTICE_VERSION).not.toMatch(/^\d{4}-\d{2}-\d{2}$/u);
  });

  it('counts only a grant recorded under the current analytics notice', () => {
    expect(readProductAnalyticsConsent(consents(PRODUCT_ANALYTICS_NOTICE_VERSION))).toBe(true);
    for (const old of ['2026-09-29', '2026-09-01', '9999-12-31', 'product-analytics-v0']) {
      expect(coversProductAnalytics(old)).toBe(false);
      expect(readProductAnalyticsConsent(consents(old))).toBe(false);
    }
  });

  it('sends nothing for an account whose grant predates the notice', async () => {
    const calls: string[] = [];
    const analytics = createAccountProductAnalytics({
      surface: 'cli',
      isEnabled: () => true,
      request: async (path) => {
        calls.push(path);
        return path === PRODUCT_ANALYTICS_CONSENT_PATH ? consents('2026-09-29') : null;
      },
    });

    analytics.track('first_chat');
    await analytics.flush();

    expect(calls).toEqual([PRODUCT_ANALYTICS_CONSENT_PATH]);
    expect(calls).not.toContain(PRODUCT_ANALYTICS_INGEST_PATH);
  });
});
