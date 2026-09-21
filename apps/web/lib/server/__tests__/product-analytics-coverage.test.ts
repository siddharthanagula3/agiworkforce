import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  query: vi.fn(),
  hasConsent: vi.fn(),
}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ execute: mocks.execute, query: mocks.query }),
}));
vi.mock('@/lib/server/consent-records', () => ({ hasConsent: mocks.hasConsent }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  PRODUCT_ANALYTICS_EVENT_NAMES,
  PRODUCT_ANALYTICS_OUTCOME_EVENTS,
  PRODUCT_ANALYTICS_PROPERTY_KEYS,
  normalizeProductAnalyticsEvent,
  requiresProductAnalyticsOutcome,
  type ProductAnalyticsEvent,
} from '@agiworkforce/types';

import {
  DERIVED_MILESTONE_EVENTS,
  DERIVED_PRODUCT_ANALYTICS_EVENTS,
  recordProductAnalyticsEvents,
} from '../product-analytics';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');
const ANALYTICS_MODULE = 'apps/web/lib/server/product-analytics.ts';
const SUBJECT = { userId: 'usr_1', organizationId: null };

const SCANNED_ROOTS = ['apps/web/app', 'apps/web/lib', 'apps/web/features', 'packages/ui'];

function productFiles(): string[] {
  const out: string[] = [];
  const walk = (current: string): void => {
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/u.test(entry.name)) continue;
      if (/\.(test|spec)\.tsx?$/u.test(entry.name)) continue;
      const relative = path.relative(REPO_ROOT, full);
      if (relative === ANALYTICS_MODULE) continue;
      out.push(full);
    }
  };
  for (const root of SCANNED_ROOTS) walk(path.join(REPO_ROOT, root));
  return out;
}

function event(overrides: Partial<ProductAnalyticsEvent> = {}): ProductAnalyticsEvent {
  return {
    name: 'assistant_response',
    surface: 'web',
    occurredAt: '2026-09-18T00:00:00.000Z',
    ...overrides,
  } as ProductAnalyticsEvent;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hasConsent.mockResolvedValue(true);
  mocks.execute.mockResolvedValue(undefined);
  mocks.query.mockResolvedValue([]);
});

describe('every event in the vocabulary is produced by something', () => {
  it('has a call site outside the analytics module, or is derived inside it', () => {
    const sources = productFiles().map((file) => readFileSync(file, 'utf8'));
    const derived = new Set<string>(DERIVED_PRODUCT_ANALYTICS_EVENTS);
    const orphans = PRODUCT_ANALYTICS_EVENT_NAMES.filter(
      (name) => !derived.has(name) && !sources.some((source) => source.includes(`'${name}'`)),
    );
    expect(orphans).toEqual([]);
  });

  // A derivation nothing calls produces nothing, so the three entry points are
  // checked for a production caller rather than taken on trust.
  it('has a production caller for every emitter the derived events depend on', () => {
    const sources = productFiles().map((file) => readFileSync(file, 'utf8'));
    const uncalled = [
      'trackProductAnalyticsEvent',
      'trackMeteredCapability',
      'trackAuditedProductEvent',
    ].filter((emitter) => !sources.some((source) => source.includes(`${emitter}(`)));
    expect(uncalled).toEqual([]);
  });

  it('derives exactly the three funnel milestones no surface can honestly report', () => {
    expect([...DERIVED_MILESTONE_EVENTS].sort()).toEqual([
      'activation',
      'first_chat',
      'first_useful_response',
    ]);
  });
});

describe('the funnel milestones the product is measured on', () => {
  function written(): string[] {
    return mocks.execute.mock.calls
      .map((call) => (call[1] as unknown[])[2])
      .filter((name): name is string => typeof name === 'string');
  }

  it('writes the first chat and the first response that actually completed', async () => {
    await recordProductAnalyticsEvents(SUBJECT, [event({ outcome: 'succeeded' })]);

    expect(written()).toContain('first_chat');
    expect(written()).toContain('first_useful_response');
  });

  it('does not call a failed first turn a useful response', async () => {
    await recordProductAnalyticsEvents(SUBJECT, [event({ outcome: 'failed' })]);

    expect(written()).toContain('first_chat');
    expect(written()).not.toContain('first_useful_response');
  });

  // Activation is the moment an account is using the product rather than
  // trying it: a completed response and one capability beyond chat.
  it('activates only once a completed response meets a capability beyond chat', async () => {
    await recordProductAnalyticsEvents(SUBJECT, [event({ outcome: 'succeeded' })]);
    expect(written()).not.toContain('activation');

    mocks.execute.mockClear();
    mocks.query.mockResolvedValue([
      { event_name: 'assistant_response' },
      { event_name: 'first_chat' },
      { event_name: 'first_useful_response' },
    ]);

    await recordProductAnalyticsEvents(SUBJECT, [
      event({ name: 'project_created', outcome: 'succeeded' }),
    ]);

    expect(written()).toContain('activation');
  });

  it('writes nothing at all for an account that refused the purpose', async () => {
    mocks.hasConsent.mockResolvedValue(false);

    expect(await recordProductAnalyticsEvents(SUBJECT, [event({ outcome: 'succeeded' })])).toBe(0);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('collects nothing when the consent ledger cannot be read', async () => {
    mocks.hasConsent.mockRejectedValue(new Error('ledger unavailable'));

    expect(await recordProductAnalyticsEvents(SUBJECT, [event({ outcome: 'succeeded' })])).toBe(0);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});

describe('an analytics row cannot carry what nobody agreed to send', () => {
  it('drops every property key outside the allowlist, whatever it is called', () => {
    const forbidden = [
      'email',
      'prompt',
      'message',
      'fileName',
      'ipAddress',
      'query',
      'conversationId',
      'apiKey',
    ];
    for (const key of forbidden) {
      expect(PRODUCT_ANALYTICS_PROPERTY_KEYS, key).not.toContain(key);
      const normalized = normalizeProductAnalyticsEvent({
        name: 'assistant_response',
        surface: 'web',
        occurredAt: '2026-09-18T00:00:00.000Z',
        outcome: 'succeeded',
        properties: { [key]: 'something-identifying' } as never,
      });
      expect(Object.keys(normalized?.properties ?? {}), key).not.toContain(key);
    }
  });

  it('keeps the allowlisted dimensions a rate is split by', () => {
    const normalized = normalizeProductAnalyticsEvent({
      name: 'tool_call',
      surface: 'web',
      occurredAt: '2026-09-18T00:00:00.000Z',
      outcome: 'failed',
      properties: { errorCode: 'timeout', capability: 'tool' },
    });
    expect(normalized?.properties).toMatchObject({ errorCode: 'timeout', capability: 'tool' });
  });
});

describe('an event whose rate is a ratio must say how it went', () => {
  it('refuses an outcome event with no outcome, for every one of them', () => {
    for (const name of PRODUCT_ANALYTICS_OUTCOME_EVENTS) {
      expect(requiresProductAnalyticsOutcome(name), name).toBe(true);
      const normalized = normalizeProductAnalyticsEvent({
        name,
        surface: 'web',
        occurredAt: '2026-09-18T00:00:00.000Z',
      });
      expect(normalized, name).toBeNull();
    }
  });

  it('records a failure as a row rather than as an absence', () => {
    const normalized = normalizeProductAnalyticsEvent({
      name: 'work_run_finished',
      surface: 'web',
      occurredAt: '2026-09-18T00:00:00.000Z',
      outcome: 'failed',
      properties: { errorCode: 'upstream_5xx' },
    });
    expect(normalized?.outcome).toBe('failed');
    expect(normalized?.properties).toMatchObject({ errorCode: 'upstream_5xx' });
  });
});
