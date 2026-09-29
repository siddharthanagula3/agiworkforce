import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ query: vi.fn(), recordFailure: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-db', () => ({
  getStripeWebhookDb: vi.fn(),
  getNeonDb: () => ({}),
}));
vi.mock('@/lib/logger', () => ({
  PINO_LEVELS: vi.fn(),
  loggerOptions: vi.fn(),
  resolveLogLevel: vi.fn(),
  shouldUsePrettyLogTransport: vi.fn(),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/observability/metrics', () => ({
  METRIC_NAME: vi.fn(),
  configurationStates: vi.fn(),
  recordBrowserTask: vi.fn(),
  recordClientFailure: vi.fn(),
  recordCompletion: vi.fn(),
  recordConfigurationState: vi.fn(),
  recordDatabaseOperation: vi.fn(),
  recordDenial: vi.fn(),
  recordHttpRequest: vi.fn(),
  recordNotificationDelivery: vi.fn(),
  recordQueueAge: vi.fn(),
  recordQueueDepth: vi.fn(),
  recordQueueWait: vi.fn(),
  recordRejection: vi.fn(),
  recordRoutingDecision: vi.fn(),
  recordSemanticDecision: vi.fn(),
  recordSemanticDecisionComparison: vi.fn(),
  recordSpanMetrics: vi.fn(),
  recordToolOutcome: vi.fn(),
  recordTurnOutcome: vi.fn(),
  recordWorkPlanSize: vi.fn(),
  resolveCompletion: vi.fn(),
  recordFailure: mocks.recordFailure,
}));
vi.mock('@/lib/server/claimed-user-scope-db', () => ({
  createClaimedUserScopedDb: () => ({ query: (...args: unknown[]) => mocks.query(...args) }),
}));

import {
  CURRENT_TERMS_VERSION,
  MATERIAL_TERMS_GRACE_DAYS,
  MIN_REQUIRED_TERMS_EFFECTIVE_AT,
  MIN_REQUIRED_TERMS_VERSION,
  forgetTermsStanding,
  mustAcceptTerms,
  readTermsStanding,
  termsNoticeHeaders,
  termsStandingFor,
  type TermsPolicy,
} from './terms';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

const noBindingRevision: TermsPolicy = {
  current: '2026-09-23',
  minRequired: null,
  minRequiredEffectiveAt: null,
};

const materialRevision: TermsPolicy = {
  current: '2026-10-01',
  minRequired: '2026-10-01',
  minRequiredEffectiveAt: '2026-11-01T00:00:00.000Z',
};

describe('termsStandingFor', () => {
  it('refuses an account with no acceptance on record', () => {
    expect(termsStandingFor(null, new Date(), noBindingRevision)).toEqual({
      kind: 'required',
      reason: 'never_accepted',
    });
  });

  it('passes the current version, or a newer one after a rollback, without a notice', () => {
    expect(termsStandingFor({ version: '2026-09-23' }, new Date(), noBindingRevision)).toEqual({
      kind: 'current',
    });
    expect(termsStandingFor({ version: '2026-12-01' }, new Date(), noBindingRevision)).toEqual({
      kind: 'current',
    });
  });

  it('passes an older version with a notice while no revision binds', () => {
    expect(termsStandingFor({ version: '2026-01-01' }, new Date(), noBindingRevision)).toEqual({
      kind: 'notice',
      acceptedVersion: '2026-01-01',
      requiredFrom: null,
    });
  });

  it('names the deadline during the grace period of a material revision', () => {
    expect(
      termsStandingFor(
        { version: '2026-09-23' },
        new Date('2026-10-15T00:00:00Z'),
        materialRevision,
      ),
    ).toEqual({
      kind: 'notice',
      acceptedVersion: '2026-09-23',
      requiredFrom: '2026-11-01T00:00:00.000Z',
    });
  });

  it('refuses a superseded version only from the effective date', () => {
    expect(
      termsStandingFor(
        { version: '2026-09-23' },
        new Date('2026-11-01T00:00:00Z'),
        materialRevision,
      ),
    ).toEqual({ kind: 'required', reason: 'superseded' });
  });
});

describe('the published terms policy', () => {
  it('versions are ISO dates, so they order as strings', () => {
    expect(CURRENT_TERMS_VERSION).toMatch(ISO_DATE);
    if (MIN_REQUIRED_TERMS_VERSION !== null) expect(MIN_REQUIRED_TERMS_VERSION).toMatch(ISO_DATE);
  });

  it('a binding revision is published, dated, and given the full grace period', () => {
    expect(MIN_REQUIRED_TERMS_VERSION === null).toBe(MIN_REQUIRED_TERMS_EFFECTIVE_AT === null);
    if (MIN_REQUIRED_TERMS_VERSION === null || MIN_REQUIRED_TERMS_EFFECTIVE_AT === null) return;
    expect(MIN_REQUIRED_TERMS_VERSION <= CURRENT_TERMS_VERSION).toBe(true);
    const graceMs =
      Date.parse(MIN_REQUIRED_TERMS_EFFECTIVE_AT) - Date.parse(MIN_REQUIRED_TERMS_VERSION);
    expect(graceMs).toBeGreaterThanOrEqual(MATERIAL_TERMS_GRACE_DAYS * DAY_MS);
  });
});

describe('termsNoticeHeaders', () => {
  it('sends nothing unless the account works under an older version', () => {
    expect(termsNoticeHeaders({ kind: 'current' })).toEqual({});
    expect(termsNoticeHeaders({ kind: 'required', reason: 'never_accepted' })).toEqual({});
  });

  it('names the published version and any deadline', () => {
    expect(
      termsNoticeHeaders({ kind: 'notice', acceptedVersion: '2026-01-01', requiredFrom: 'x' }),
    ).toEqual({ 'X-AGI-Terms-Notice': CURRENT_TERMS_VERSION, 'X-AGI-Terms-Required-From': 'x' });
  });
});

describe('readTermsStanding', () => {
  beforeEach(() => {
    mocks.query.mockReset();
    forgetTermsStanding();
  });

  function acceptedRow(version: string | null) {
    return [
      {
        terms_version: version,
        terms_accepted_at: version ? '2026-09-01T00:00:00Z' : null,
        terms_accepted_surface: version ? 'web-login' : null,
      },
    ];
  }

  it('caches a passing standing per user', async () => {
    mocks.query.mockResolvedValue(acceptedRow(CURRENT_TERMS_VERSION));

    await readTermsStanding('user-1');
    await readTermsStanding('user-1');

    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it('never caches a refusal, so an acceptance elsewhere is seen on the next turn', async () => {
    mocks.query
      .mockResolvedValueOnce(acceptedRow(null))
      .mockResolvedValueOnce(acceptedRow(CURRENT_TERMS_VERSION));

    await expect(readTermsStanding('user-1')).resolves.toMatchObject({ kind: 'required' });
    await expect(readTermsStanding('user-1')).resolves.toEqual({ kind: 'current' });
  });

  it('lets a read error reach the caller', async () => {
    mocks.query.mockRejectedValue(new Error('connection reset'));

    await expect(readTermsStanding('user-1')).rejects.toThrow('connection reset');
  });
});

describe('mustAcceptTerms', () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.recordFailure.mockReset();
    forgetTermsStanding();
  });

  it('stops an account with no acceptance on record', async () => {
    mocks.query.mockResolvedValue([
      { terms_version: null, terms_accepted_at: null, terms_accepted_surface: null },
    ]);
    await expect(mustAcceptTerms('user-1', 'page')).resolves.toBe(true);
  });

  it('lets an account on an older valid version continue', async () => {
    mocks.query.mockResolvedValue([
      {
        terms_version: '2026-01-01',
        terms_accepted_at: '2026-01-02T00:00:00Z',
        terms_accepted_surface: 'web-login',
      },
    ]);
    await expect(mustAcceptTerms('user-1', 'page')).resolves.toBe(false);
  });

  it('lets the account through, and counts it, when acceptance cannot be read', async () => {
    mocks.query.mockRejectedValue(new Error('connection reset'));
    await expect(mustAcceptTerms('user-1', 'page')).resolves.toBe(false);
    expect(mocks.recordFailure).toHaveBeenCalledWith('database', 'terms_acceptance_unreadable');
  });
});
