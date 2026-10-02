// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IdentityUser } from '@agiworkforce/identity';
import { createMemoryKeyValueStore, type MemoryKeyValueStore } from '@agiworkforce/key-value';
import {
  attestationStanding,
  credentialSha256,
  recordFreeQuotaSuspension,
  writeQuotaAttestation,
  type FreeQuotaState,
  type QuotaAttestation,
} from '@/lib/free-quota-authorization';
import { getHandoffConfig } from '@/lib/support/handoff/config';
import { loadFreePools, type FreeQuotaTermsReview } from './free-pools';
import { loadFreeQuotaPolicy } from './free-quota-catalogue';
import {
  describeFreeQuotaRenewal,
  freeQuotaRenewalAlerts,
  remindFreeQuotaRenewals,
  type FreeQuotaRenewalAlert,
} from './free-quota-renewal';
type ScanModule0 = typeof import('@/lib/server/key-value');
type ScanModule1 = typeof import('@/lib/server/identity');
type ScanModule2 = typeof import('@/lib/support/handoff/resend-client');
type ScanModule3 = typeof import('@/lib/server/incident/pager');
type ScanModule4 = typeof import('./free-pools');

const mocks = vi.hoisted(() => ({
  store: null as unknown as MemoryKeyValueStore,
  identity: vi.fn(),
  email: vi.fn(),
  page: vi.fn(),
  termsReview: null as FreeQuotaTermsReview | null,
}));

vi.mock('@/lib/server/key-value', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  getKeyValueStore: () => mocks.store,
  getKeyValueProvider: () => 'upstash',
}));
vi.mock('@/lib/server/identity', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  getIdentityUser: mocks.identity,
}));
vi.mock('@/lib/support/handoff/resend-client', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  sendSupportEmail: mocks.email,
}));
vi.mock('@/lib/server/incident/pager', async (importOriginal) => ({
  ...(await importOriginal<ScanModule3>()),
  pageOnCall: mocks.page,
}));
vi.mock('./free-pools', async (importOriginal) => {
  const actual = await importOriginal<ScanModule4>();
  return {
    ...actual,
    loadFreePools: () => {
      const document = actual.loadFreePools();
      return document.inventory
        ? { ...document, inventory: { ...document.inventory, termsReview: mocks.termsReview } }
        : document;
    },
  };
});

const API_KEY = 'fixture-provider-key';
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const NOW = Date.UTC(2026, 9, 2, 15);
const policy = loadFreeQuotaPolicy();
const LEAD_MS = policy.renewalReminderLeadMs;
const VALID_MS = policy.attestationMaxAgeMs;
const inventory = loadFreePools().inventory!;

function review(overrides: Partial<FreeQuotaTermsReview> = {}): FreeQuotaTermsReview {
  return {
    terms: {
      commercialUseAllowed: true,
      thirdPartyServingAllowed: true,
      proxyingAllowed: true,
      promptsExcludedFromTraining: true,
    },
    evidenceUrl: 'https://example.com/terms-review-evidence',
    reviewedBy: 'fixture-reviewer',
    verifiedAtMs: NOW - 10 * DAY_MS,
    expiresAtMs: NOW + 80 * DAY_MS,
    approvedOfferingKeys: [inventory.entries[0]!.offeringKey],
    ...overrides,
  };
}

function attestation(overrides: Partial<QuotaAttestation> = {}): QuotaAttestation {
  return {
    sourceUrl: 'https://home.qwencloud.com/benefits',
    checkedAtMs: NOW - DAY_MS,
    credentialSha256: credentialSha256(API_KEY),
    quotaOnlyOfferings: 'all',
    attestedBy: 'fixture-operator',
    ...overrides,
  };
}

function alerts(input: {
  termsReview?: FreeQuotaTermsReview | null;
  attestation?: QuotaAttestation | null;
  suspendedAtMs?: number | null;
  apiKey?: string;
  nowMs?: number;
}): FreeQuotaRenewalAlert[] {
  const state: Pick<FreeQuotaState, 'attestation' | 'suspendedAtMs'> = {
    attestation: input.attestation === undefined ? attestation() : input.attestation,
    suspendedAtMs: input.suspendedAtMs ?? null,
  };
  const nowMs = input.nowMs ?? NOW;
  return freeQuotaRenewalAlerts({
    termsReview: input.termsReview === undefined ? review() : input.termsReview,
    attestation: attestationStanding({ state, apiKey: input.apiKey ?? API_KEY, policy, nowMs }),
    policy,
    nowMs,
  });
}

function reasons(list: FreeQuotaRenewalAlert[]): string[] {
  return list.map((alert) => alert.reason);
}

function admin(id: string, email: string, verified = true): IdentityUser {
  return {
    id,
    primaryEmail: email,
    primaryEmailVerification: verified ? 'verified' : 'unverified',
    primaryEmailAddressId: null,
    emails: [email],
    emailAddresses: [],
    firstName: null,
    lastName: null,
    fullName: null,
    username: null,
    imageUrl: null,
    publicMetadata: {},
    privateMetadata: {},
    banned: false,
    locked: false,
    passwordEnabled: true,
    twoFactorEnabled: false,
    totpEnabled: false,
    backupCodesEnabled: false,
    createdAt: null,
    lastSignInAt: null,
    enterpriseAccounts: [],
  };
}

function emailedTo(): string[] {
  return mocks.email.mock.calls.map(([input]) => (input as { to: string }).to);
}

function emailedSubjects(): string[] {
  return mocks.email.mock.calls.map(([input]) => (input as { subject: string }).subject);
}

beforeEach(() => {
  mocks.store = createMemoryKeyValueStore();
  mocks.termsReview = review();
  vi.stubEnv('QWEN_API_KEY', API_KEY);
  vi.stubEnv('AGI_PLATFORM_ADMIN_USER_IDS', 'user_owner,user_operator');
  mocks.identity.mockImplementation(async (id: string) =>
    id === 'user_owner' ? admin(id, 'owner@example.com') : admin(id, 'operator@example.com', false),
  );
  mocks.email.mockResolvedValue({ delivered: true, providerMessageId: 'message-1' });
  mocks.page.mockResolvedValue('paged');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('which free quota gates need a reminder', () => {
  it('asks for nothing while both gates are current and far from running out', () => {
    expect(alerts({})).toEqual([]);
  });

  it('warns three days before the terms review runs out, and not a moment earlier', () => {
    expect(reasons(alerts({ termsReview: review({ expiresAtMs: NOW + LEAD_MS }) }))).toEqual([
      'terms_review_expiring',
    ]);
    expect(alerts({ termsReview: review({ expiresAtMs: NOW + LEAD_MS + 1 }) })).toEqual([]);
  });

  it('tells again when the terms review has run out', () => {
    expect(reasons(alerts({ termsReview: review({ expiresAtMs: NOW }) }))).toEqual([
      'terms_review_expired',
    ]);
  });

  it.each([
    ['missing', null],
    [
      'refusing a term',
      review({
        terms: {
          commercialUseAllowed: false,
          thirdPartyServingAllowed: true,
          proxyingAllowed: true,
          promptsExcludedFromTraining: true,
        },
      }),
    ],
    ['dated after now', review({ verifiedAtMs: NOW + DAY_MS })],
  ])('asks nothing of a review that is %s, which never served', (_label, termsReview) => {
    expect(alerts({ termsReview })).toEqual([]);
  });

  it('warns three days before the console check runs out', () => {
    const checkedAtMs = NOW - VALID_MS + LEAD_MS;
    expect(alerts({ attestation: attestation({ checkedAtMs }) })).toEqual([
      { reason: 'console_check_expiring', checkedAtMs, freshUntilMs: checkedAtMs + VALID_MS },
    ]);
    expect(alerts({ attestation: attestation({ checkedAtMs: checkedAtMs + 1 }) })).toEqual([]);
  });

  it('tells again once the console check has run out', () => {
    const checkedAtMs = NOW - VALID_MS;
    expect(alerts({ attestation: attestation({ checkedAtMs }) })).toEqual([
      { reason: 'console_check_expired', checkedAtMs, freshUntilMs: NOW },
    ]);
  });

  it('does not call a check dated after the server clock expired', () => {
    expect(alerts({ attestation: attestation({ checkedAtMs: NOW + 1_000 }) })).toEqual([]);
  });

  it('tells when the provider key changed after the console check', () => {
    expect(reasons(alerts({ apiKey: 'fixture-rotated-provider-key' }))).toEqual([
      'console_check_other_key',
    ]);
  });

  it('tells when the provider reported a billing state after the console check', () => {
    expect(alerts({ suspendedAtMs: NOW - 60_000 })).toEqual([
      { reason: 'billing_signal', signalAtMs: NOW - 60_000 },
    ]);
  });

  it('tells, once a day, that no console check is recorded while the terms review serves', () => {
    expect(alerts({ attestation: null })).toEqual([
      { reason: 'console_check_missing', day: '2026-10-02' },
    ]);
    expect(
      reasons(alerts({ attestation: null, termsReview: review({ expiresAtMs: NOW + DAY_MS }) })),
    ).toEqual(['terms_review_expiring', 'console_check_missing']);
  });

  it.each([
    ['missing', null],
    ['expired', review({ expiresAtMs: NOW - 1 })],
    ['dated after now', review({ verifiedAtMs: NOW + DAY_MS })],
  ])('asks for no console check while the terms review is %s', (_label, termsReview) => {
    expect(reasons(alerts({ attestation: null, termsReview }))).not.toContain(
      'console_check_missing',
    );
  });

  it('reminds about both gates in the same run when both run out', () => {
    expect(
      reasons(
        alerts({
          termsReview: review({ expiresAtMs: NOW - 1 }),
          attestation: attestation({ checkedAtMs: NOW - VALID_MS - 1 }),
        }),
      ),
    ).toEqual(['terms_review_expired', 'console_check_expired']);
  });
});

describe('what a reminder says', () => {
  const cases: Array<[FreeQuotaRenewalAlert, 'warning' | 'critical', RegExp]> = [
    [{ reason: 'terms_review_expiring', review: review() }, 'warning', /renew the terms review/],
    [{ reason: 'terms_review_expired', review: review() }, 'critical', /terms review ran out/],
    [
      { reason: 'console_check_expiring', checkedAtMs: NOW, freshUntilMs: NOW + LEAD_MS },
      'warning',
      /renew the console check/,
    ],
    [
      { reason: 'console_check_expired', checkedAtMs: NOW - VALID_MS, freshUntilMs: NOW },
      'critical',
      /console check ran out/,
    ],
    [
      { reason: 'console_check_other_key', checkedAtMs: NOW, freshUntilMs: NOW + VALID_MS },
      'critical',
      /provider key changed/,
    ],
    [{ reason: 'billing_signal', signalAtMs: NOW }, 'critical', /billing state/],
    [
      { reason: 'console_check_missing', day: '2026-10-02' },
      'critical',
      /no console check is recorded/,
    ],
  ];

  it.each(cases)('names the gate, the effect on users and the fix', (alert, severity, subject) => {
    const message = describeFreeQuotaRenewal(alert, 'production');

    expect(message.severity).toBe(severity);
    expect(message.subject).toMatch(
      new RegExp(`^\\[AGI ${severity === 'critical' ? 'CRITICAL' : 'WARNING'}\\] production`),
    );
    expect(message.subject).toMatch(subject);
    expect(message.text).toContain('Not available right now');
    expect(message.text).toContain('/operator#quota');
    expect(message.text).toContain('docs/runbooks/free-quota-models.md');
  });
});

describe('sending the reminders', () => {
  it('reports what the deployment is missing and sends nothing', async () => {
    vi.stubEnv('QWEN_API_KEY', '');

    expect(await remindFreeQuotaRenewals(NOW)).toEqual({
      checked: false,
      missing: ['credential'],
    });
    expect(mocks.email).not.toHaveBeenCalled();
    expect(mocks.page).not.toHaveBeenCalled();
  });

  it('tells each verified platform admin once, and not again on the next run', async () => {
    await writeQuotaAttestation(mocks.store, attestation({ checkedAtMs: NOW - VALID_MS + DAY_MS }));

    expect(await remindFreeQuotaRenewals(NOW)).toEqual({
      checked: true,
      reminders: [{ reason: 'console_check_expiring', outcome: 'sent' }],
    });
    expect(emailedTo()).toEqual(['owner@example.com']);
    expect(mocks.page).toHaveBeenCalledWith(
      'warning',
      expect.stringContaining('renew the console check'),
      expect.stringContaining('/operator#quota'),
      undefined,
      'free-quota-renewal',
    );

    expect(mocks.identity).toHaveBeenCalledTimes(2);

    expect(await remindFreeQuotaRenewals(NOW + HOUR_MS)).toEqual({
      checked: true,
      reminders: [{ reason: 'console_check_expiring', outcome: 'already_sent' }],
    });
    expect(mocks.email).toHaveBeenCalledTimes(1);
    expect(mocks.identity).toHaveBeenCalledTimes(2);
  });

  it('tells again, as critical, once the same check runs out', async () => {
    const checkedAtMs = NOW - VALID_MS + DAY_MS;
    await writeQuotaAttestation(mocks.store, attestation({ checkedAtMs }));
    await remindFreeQuotaRenewals(NOW);

    expect(await remindFreeQuotaRenewals(checkedAtMs + VALID_MS)).toEqual({
      checked: true,
      reminders: [{ reason: 'console_check_expired', outcome: 'sent' }],
    });
    expect(mocks.page).toHaveBeenLastCalledWith(
      'critical',
      expect.stringContaining('free models are off'),
      expect.any(String),
      undefined,
      'free-quota-renewal',
    );
  });

  it('reminds about the terms review from its expiry in the code', async () => {
    await writeQuotaAttestation(mocks.store, attestation());
    mocks.termsReview = review({ expiresAtMs: NOW + DAY_MS });

    expect(await remindFreeQuotaRenewals(NOW)).toEqual({
      checked: true,
      reminders: [{ reason: 'terms_review_expiring', outcome: 'sent' }],
    });
  });

  it('reminds again for a renewal that only moved the review expiry', async () => {
    await writeQuotaAttestation(mocks.store, attestation());
    mocks.termsReview = review({ expiresAtMs: NOW + DAY_MS });
    await remindFreeQuotaRenewals(NOW);

    mocks.termsReview = review({ expiresAtMs: NOW + 31 * DAY_MS });
    const later = NOW + 29 * DAY_MS;
    await writeQuotaAttestation(mocks.store, attestation({ checkedAtMs: later - DAY_MS }));

    expect(await remindFreeQuotaRenewals(later)).toEqual({
      checked: true,
      reminders: [{ reason: 'terms_review_expiring', outcome: 'sent' }],
    });
    expect(mocks.email).toHaveBeenCalledTimes(2);
  });

  it('tells admins each day while the stored console check cannot be read', async () => {
    await mocks.store.set('agi-fquota:attestation', { sourceUrl: 'https://example.com/moved' });

    expect(await remindFreeQuotaRenewals(NOW)).toEqual({
      checked: true,
      reminders: [{ reason: 'console_check_missing', outcome: 'sent' }],
    });
    expect(mocks.email.mock.calls[0]![0]).toMatchObject({
      subject: expect.stringMatching(/^\[AGI CRITICAL\] .*no console check is recorded/),
      text: expect.stringContaining('can no longer be read'),
    });
    expect(await remindFreeQuotaRenewals(NOW + HOUR_MS)).toEqual({
      checked: true,
      reminders: [{ reason: 'console_check_missing', outcome: 'already_sent' }],
    });
    expect(await remindFreeQuotaRenewals(NOW + DAY_MS)).toEqual({
      checked: true,
      reminders: [{ reason: 'console_check_missing', outcome: 'sent' }],
    });
    expect(mocks.email).toHaveBeenCalledTimes(2);
  });

  it('still tells admins about a billing signal whose record cannot be read', async () => {
    await mocks.store.set(`agi-fquota:suspended:${credentialSha256(API_KEY).slice(0, 16)}`, {
      unreadable: true,
    });

    expect(await remindFreeQuotaRenewals(NOW)).toEqual({
      checked: true,
      reminders: [{ reason: 'billing_signal', outcome: 'sent' }],
    });
    expect(mocks.email.mock.calls[0]![0]).toMatchObject({
      text: expect.stringContaining('At an unrecorded time the provider answered'),
    });
  });

  it('falls back to the support mailbox when no platform admin has a verified address', async () => {
    await recordFreeQuotaSuspension(mocks.store, {
      apiKey: API_KEY,
      signal: 'Arrearage',
      nowMs: NOW - 60_000,
    });
    mocks.identity.mockResolvedValue(null);

    await remindFreeQuotaRenewals(NOW);

    expect(emailedTo()).toEqual([getHandoffConfig().fallbackEmail]);
  });

  it('keeps a reminder that reached nobody for the next run', async () => {
    await writeQuotaAttestation(mocks.store, attestation({ checkedAtMs: NOW - VALID_MS }));
    mocks.email.mockResolvedValue({ delivered: false, reason: 'not_configured', detail: 'off' });
    mocks.page.mockResolvedValue('unconfigured');

    expect(await remindFreeQuotaRenewals(NOW)).toEqual({
      checked: true,
      reminders: [{ reason: 'console_check_expired', outcome: 'undelivered' }],
    });

    mocks.email.mockResolvedValue({ delivered: true, providerMessageId: 'message-2' });
    expect(await remindFreeQuotaRenewals(NOW + HOUR_MS)).toEqual({
      checked: true,
      reminders: [{ reason: 'console_check_expired', outcome: 'sent' }],
    });
  });

  it('keeps a reminder whose sending failed outright for the next run', async () => {
    await writeQuotaAttestation(mocks.store, attestation({ checkedAtMs: NOW - VALID_MS }));
    mocks.email.mockRejectedValue(new Error('transport failed'));
    mocks.page.mockResolvedValue('unconfigured');

    expect(await remindFreeQuotaRenewals(NOW)).toEqual({
      checked: true,
      reminders: [{ reason: 'console_check_expired', outcome: 'undelivered' }],
    });

    mocks.email.mockResolvedValue({ delivered: true, providerMessageId: 'message-3' });
    expect(await remindFreeQuotaRenewals(NOW + HOUR_MS)).toEqual({
      checked: true,
      reminders: [{ reason: 'console_check_expired', outcome: 'sent' }],
    });
  });

  it('counts a reminder the pager delivered while an email transport failed', async () => {
    await writeQuotaAttestation(mocks.store, attestation({ checkedAtMs: NOW - VALID_MS }));
    mocks.email.mockRejectedValue(new Error('transport failed'));

    expect(await remindFreeQuotaRenewals(NOW)).toEqual({
      checked: true,
      reminders: [{ reason: 'console_check_expired', outcome: 'sent' }],
    });
    expect(await remindFreeQuotaRenewals(NOW + HOUR_MS)).toEqual({
      checked: true,
      reminders: [{ reason: 'console_check_expired', outcome: 'already_sent' }],
    });
    expect(mocks.page).toHaveBeenCalledTimes(1);
  });

  it('sends the other reminders when one claim cannot be stored, and that one on the next run', async () => {
    mocks.termsReview = review({ expiresAtMs: NOW + DAY_MS });
    await writeQuotaAttestation(mocks.store, attestation({ checkedAtMs: NOW - VALID_MS + DAY_MS }));
    const set = mocks.store.set.bind(mocks.store);
    let failures = 1;
    vi.spyOn(mocks.store, 'set').mockImplementation(async (key, value, options) => {
      if (key.includes('console_check_expiring') && failures-- > 0) {
        throw new Error('transient store failure');
      }
      return set(key, value, options);
    });

    expect(await remindFreeQuotaRenewals(NOW)).toEqual({
      checked: true,
      reminders: [
        { reason: 'terms_review_expiring', outcome: 'sent' },
        { reason: 'console_check_expiring', outcome: 'undelivered' },
      ],
    });
    expect(emailedSubjects()).toEqual([expect.stringContaining('renew the terms review')]);

    expect(await remindFreeQuotaRenewals(NOW + HOUR_MS)).toEqual({
      checked: true,
      reminders: [
        { reason: 'terms_review_expiring', outcome: 'already_sent' },
        { reason: 'console_check_expiring', outcome: 'sent' },
      ],
    });
    expect(emailedSubjects()).toEqual([
      expect.stringContaining('renew the terms review'),
      expect.stringContaining('renew the console check'),
    ]);
  });

  it('lets the next run send a reminder whose run died while sending it', async () => {
    let storeNowMs = NOW;
    mocks.store = createMemoryKeyValueStore({ now: () => storeNowMs });
    await writeQuotaAttestation(mocks.store, attestation({ checkedAtMs: NOW - VALID_MS }));
    mocks.page.mockResolvedValue('unconfigured');
    mocks.email.mockReturnValueOnce(new Promise(() => {}));
    void remindFreeQuotaRenewals(NOW);
    await vi.waitFor(() => expect(mocks.email).toHaveBeenCalledTimes(1));

    storeNowMs = NOW + HOUR_MS;

    expect(await remindFreeQuotaRenewals(NOW + HOUR_MS)).toEqual({
      checked: true,
      reminders: [{ reason: 'console_check_expired', outcome: 'sent' }],
    });
    expect(mocks.email).toHaveBeenCalledTimes(2);
  });
});
