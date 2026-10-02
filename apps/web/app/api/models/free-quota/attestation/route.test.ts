// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { FreeQuotaAttestationStatusSchema } from '@agiworkforce/cloud-contracts';
import { createMemoryKeyValueStore, type MemoryKeyValueStore } from '@agiworkforce/key-value';
import { createError } from '@/lib/errors';
import {
  credentialSha256,
  readFreeQuotaState,
  recordFreeQuotaSuspension,
} from '@/lib/free-quota-authorization';
import { loadFreePools, type FreeQuotaTermsReview } from '@/lib/server/free-pools';
type ScanModule0 = typeof import('@/lib/auth-guards');
type ScanModule1 = typeof import('@/lib/csrf');
type ScanModule2 = typeof import('@/lib/rate-limit');
type ScanModule3 = typeof import('@/lib/security-audit');
type ScanModule4 = typeof import('@/lib/server/key-value');
type ScanModule5 = typeof import('@/lib/server/free-pools');

const mocks = vi.hoisted(() => ({
  store: null as unknown as MemoryKeyValueStore,
  admin: vi.fn(),
  audit: vi.fn(),
  csrf: vi.fn(),
  termsReview: undefined as FreeQuotaTermsReview | null | undefined,
}));

vi.mock('@/lib/auth-guards', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  requirePlatformAdmin: mocks.admin,
}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  requireCsrfToken: mocks.csrf,
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<ScanModule3>()),
  recordAuditEvent: mocks.audit,
}));
vi.mock('@/lib/server/key-value', async (importOriginal) => ({
  ...(await importOriginal<ScanModule4>()),
  getKeyValueStore: () => mocks.store,
  getKeyValueProvider: () => 'upstash',
}));
vi.mock('@/lib/server/free-pools', async (importOriginal) => {
  const actual = await importOriginal<ScanModule5>();
  return {
    ...actual,
    loadFreePools: () => {
      const document = actual.loadFreePools();
      if (mocks.termsReview === undefined || !document.inventory) return document;
      return { ...document, inventory: { ...document.inventory, termsReview: mocks.termsReview } };
    },
  };
});

const { GET, POST } = await import('./route');

const API_KEY = 'fixture-provider-key';
const DAY_MS = 24 * 60 * 60 * 1000;
const inventory = loadFreePools().inventory!;
const ATTESTATION_GATES = [
  'account_billing_signal',
  'attestation_missing',
  'attestation_other_credential',
  'attestation_stale',
  'attestation_excludes_offering',
];

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
    verifiedAtMs: Date.now() - DAY_MS,
    expiresAtMs: Date.now() + 90 * DAY_MS,
    approvedOfferingKeys: inventory.entries.map((entry) => entry.offeringKey),
    ...overrides,
  };
}

function attest(body: unknown) {
  return POST(
    new NextRequest('https://agiworkforce.com/api/models/free-quota/attestation', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
}

async function stored() {
  return (
    await readFreeQuotaState(mocks.store, {
      apiKey: API_KEY,
      observedOn: inventory.observedOn,
      offeringKeys: [],
    })
  ).attestation;
}

async function status() {
  const response = await GET(
    new NextRequest('https://agiworkforce.com/api/models/free-quota/attestation'),
  );
  return FreeQuotaAttestationStatusSchema.parse(await response.json());
}

async function configuredStatus() {
  const body = await status();
  if (!body.configured) throw new Error('expected a configured deployment');
  return body;
}

beforeEach(() => {
  vi.stubEnv('QWEN_API_KEY', API_KEY);
  mocks.store = createMemoryKeyValueStore();
  mocks.admin.mockResolvedValue({ userId: 'fixture-operator' });
  mocks.csrf.mockResolvedValue(null);
  mocks.audit.mockResolvedValue(undefined);
  mocks.termsReview = null;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it('binds a recent console check to the server key and records who made it', async () => {
  const checkedAtMs = Date.now() - 60_000;
  const chosen = (await configuredStatus()).offerings.slice(0, 3).map((offering) => offering.key);
  const response = await attest({ checkedAtMs, quotaOnlyOfferings: chosen });
  expect(response.status).toBe(200);
  expect(await stored()).toEqual({
    sourceUrl: 'https://home.qwencloud.com/benefits',
    checkedAtMs,
    credentialSha256: credentialSha256(API_KEY),
    quotaOnlyOfferings: chosen,
    attestedBy: 'fixture-operator',
  });
  expect(mocks.audit).toHaveBeenCalledWith(
    expect.objectContaining({ eventType: 'admin_policy_changed', userId: 'fixture-operator' }),
  );
  const after = await configuredStatus();
  expect(after.attestation.record).toMatchObject({ checkedAtMs, boundToCurrentKey: true });
});

it('stamps a check sent as "now" with the server clock, so no browser clock reaches the record', async () => {
  const serverNowMs = Date.parse('2026-10-02T15:00:00.000Z');
  vi.spyOn(Date, 'now').mockReturnValue(serverNowMs);

  const response = await attest({ checkedAtMs: 'now', quotaOnlyOfferings: 'all' });

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    checkedAtMs: serverNowMs,
    freshUntilMs: serverNowMs + 30 * DAY_MS,
    offerings: expect.any(Number),
  });
  expect((await stored())?.checkedAtMs).toBe(serverNowMs);
});

it('records "all" as the models it can list now, so a model added to the inventory later is not covered', async () => {
  const listed = (await configuredStatus()).offerings.map((offering) => offering.key);
  const unlisted = inventory.entries
    .map((entry) => entry.offeringKey)
    .filter((key) => !listed.includes(key));
  expect(unlisted.length).toBeGreaterThan(0);

  const response = await attest({ checkedAtMs: 'now', quotaOnlyOfferings: 'all' });

  expect(response.status).toBe(200);
  expect((await response.json()).offerings).toBe(listed.length);
  expect((await stored())?.quotaOnlyOfferings).toEqual(listed);
  expect(mocks.audit).toHaveBeenCalledWith(
    expect.objectContaining({ detail: expect.objectContaining({ scopes: listed }) }),
  );
  const after = await configuredStatus();
  expect(after.attestation.record?.offerings).toBe(listed.length);
});

it('records nothing for "all" once no inventory model can be served from the free quota', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2027-06-01T00:00:00.000Z'));

  const response = await attest({ checkedAtMs: 'now', quotaOnlyOfferings: 'all' });

  expect(response.status).toBe(400);
  expect((await response.json()).error.code).toBe('attestation_nothing_to_cover');
  expect(await stored()).toBeNull();
  expect(mocks.audit).not.toHaveBeenCalled();
});

it.each([
  [
    'an old check',
    { checkedAtMs: Date.now() - 7 * 24 * 60 * 60 * 1000, quotaOnlyOfferings: 'all' },
  ],
  ['a future check', { checkedAtMs: Date.now() + 60_000, quotaOnlyOfferings: 'all' }],
  ['an unknown offering', { checkedAtMs: Date.now(), quotaOnlyOfferings: ['not-an-offering'] }],
  ['a malformed body', { quotaOnlyOfferings: 'all' }],
  [
    'a check time that is neither "now" nor a number',
    { checkedAtMs: 'today', quotaOnlyOfferings: 'all' },
  ],
])('stores nothing for %s', async (_label, body) => {
  expect((await attest(body)).status).toBe(400);
  expect(await stored()).toBeNull();
  expect(mocks.audit).not.toHaveBeenCalled();
});

it('stores nothing when the deployment holds no provider key', async () => {
  vi.stubEnv('QWEN_API_KEY', '');
  expect((await attest({ checkedAtMs: 'now', quotaOnlyOfferings: 'all' })).status).toBe(503);
  expect(mocks.audit).not.toHaveBeenCalled();
});

it('names each missing piece when the deployment cannot record a check', async () => {
  vi.stubEnv('QWEN_API_KEY', '');
  expect(await status()).toEqual({
    configured: false,
    sharedState: true,
    credential: false,
    inventory: true,
  });
});

it('reports a missing review and a missing check, with nothing serving', async () => {
  const body = await configuredStatus();

  expect(body.termsReview).toEqual({ standing: 'missing', review: null });
  expect(body.attestation).toEqual({ standing: 'missing', record: null });
  expect(body.consolePage).toBe('https://home.qwencloud.com/benefits');
  expect(body.serving.total).toBe(inventory.entries.length);
  expect(body.serving.ready).toBe(0);
  expect(body.serving.blocked.map((entry) => entry.outcome)).toContain('terms_review_missing');
  expect(body.offerings.length).toBeGreaterThan(0);
  expect(body.offerings.every((offering) => !offering.attested)).toBe(true);
});

it('shows the terms review as its own gate, naming the terms it refuses', async () => {
  const refused = review({
    terms: {
      commercialUseAllowed: true,
      thirdPartyServingAllowed: true,
      proxyingAllowed: false,
      promptsExcludedFromTraining: true,
    },
  });
  mocks.termsReview = refused;
  expect((await attest({ checkedAtMs: 'now', quotaOnlyOfferings: 'all' })).status).toBe(200);

  const body = await configuredStatus();

  expect(body.termsReview).toEqual({
    standing: 'terms_refused',
    review: {
      reviewedBy: 'fixture-reviewer',
      verifiedAtMs: refused.verifiedAtMs,
      expiresAtMs: refused.expiresAtMs,
      evidenceUrl: 'https://example.com/terms-review-evidence',
      terms: refused.terms,
      approvedOfferings: inventory.entries.length,
    },
  });
  expect(body.attestation.standing).toBe('current');
  expect(body.serving.ready).toBe(0);
  expect(body.serving.blocked.map((entry) => entry.outcome)).toContain('terms_review_missing');
});

it.each([
  ['expiring', () => review({ expiresAtMs: Date.now() + DAY_MS })],
  [
    'expired',
    () => review({ verifiedAtMs: Date.now() - 91 * DAY_MS, expiresAtMs: Date.now() - DAY_MS }),
  ],
  ['not_yet_valid', () => review({ verifiedAtMs: Date.now() + DAY_MS })],
  ['current', () => review()],
] as const)('reads a %s terms review', async (standing, build) => {
  mocks.termsReview = build();
  expect((await configuredStatus()).termsReview.standing).toBe(standing);
});

it('counts as serving only what both gates let through', async () => {
  mocks.termsReview = review();
  expect((await attest({ checkedAtMs: 'now', quotaOnlyOfferings: 'all' })).status).toBe(200);

  const { serving } = await configuredStatus();

  expect(serving.ready).toBeGreaterThan(0);
  expect(serving.ready + serving.blocked.reduce((sum, entry) => sum + entry.count, 0)).toBe(
    serving.total,
  );
  const outcomes = serving.blocked.map((entry) => entry.outcome);
  expect(outcomes).not.toContain('terms_review_missing');
  for (const gate of ATTESTATION_GATES) expect(outcomes).not.toContain(gate);
});

it('reads back a selected record as covering exactly those models', async () => {
  const body = await configuredStatus();
  const chosen = body.offerings.slice(0, 2).map((offering) => offering.key);
  expect((await attest({ checkedAtMs: 'now', quotaOnlyOfferings: chosen })).status).toBe(200);

  const after = await configuredStatus();
  expect(after.attestation.standing).toBe('current');
  expect(after.attestation.record).toMatchObject({ offerings: 2, attestedBy: 'fixture-operator' });
  expect(after.offerings.filter((offering) => offering.attested).map((o) => o.key)).toEqual(chosen);
});

it('reports a check made for another key as bound to a different key', async () => {
  expect((await attest({ checkedAtMs: 'now', quotaOnlyOfferings: 'all' })).status).toBe(200);
  vi.stubEnv('QWEN_API_KEY', 'fixture-rotated-provider-key');

  const after = await configuredStatus();

  expect(after.attestation.standing).toBe('other_credential');
  expect(after.attestation.record?.boundToCurrentKey).toBe(false);
  expect(JSON.stringify(after)).not.toContain(credentialSha256(API_KEY));
});

it('reports a billing signal with the time it was recorded', async () => {
  const signalAtMs = Date.now() - 60_000;
  await recordFreeQuotaSuspension(mocks.store, {
    apiKey: API_KEY,
    signal: 'Arrearage',
    nowMs: signalAtMs,
  });

  const body = await configuredStatus();

  expect(body.attestation.standing).toBe('billing_signal');
  expect(body.billingSignalAtMs).toBe(signalAtMs);
  expect(body.billingSignalUnreadable).toBe(false);
});

it('reports a billing signal record it cannot read as unreadable, never as a time', async () => {
  await mocks.store.set(`agi-fquota:suspended:${credentialSha256(API_KEY).slice(0, 16)}`, {
    unreadable: true,
  });
  expect((await attest({ checkedAtMs: 'now', quotaOnlyOfferings: 'all' })).status).toBe(200);

  const body = await configuredStatus();

  expect(body.attestation.standing).toBe('billing_signal');
  expect(body.billingSignalAtMs).toBeNull();
  expect(body.billingSignalUnreadable).toBe(true);
});

it('is closed to anyone who is not a platform operator', async () => {
  mocks.admin.mockRejectedValue(createError.notFound('Not found.'));
  expect((await attest({ checkedAtMs: 'now', quotaOnlyOfferings: 'all' })).status).toBe(404);
  expect(await stored()).toBeNull();
  expect(
    (await GET(new NextRequest('https://agiworkforce.com/api/models/free-quota/attestation')))
      .status,
  ).toBe(404);
});

it('refuses a write without a CSRF token', async () => {
  mocks.csrf.mockResolvedValue(new Response(null, { status: 403 }));
  expect((await attest({ checkedAtMs: 'now', quotaOnlyOfferings: 'all' })).status).toBe(403);
  expect(await stored()).toBeNull();
});
