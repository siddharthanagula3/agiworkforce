// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryKeyValueStore, type KeyValueStore } from '@agiworkforce/key-value';
import {
  BILLING_PLAN_CAPABILITY_TIERS,
  BILLING_PLAN_PRICING,
  getProviderOfferings,
  isFreeBillingPlanTier,
  type BillingPlanCapability,
} from '@agiworkforce/types';
import {
  credentialSha256,
  minimumTurnUnits,
  recordFreeQuotaHold,
  recordFreeQuotaSuspension,
  reserveFreeQuotaAllowance,
  sharesManagedRoute,
  writeQuotaAttestation,
  type QuotaAttestation,
} from '@/lib/free-quota-authorization';
import {
  buildFreeQuotaCatalogue,
  freeMediaOfferFor,
  freeQuotaChatUseOrder,
  freeQuotaContextFor,
  freeQuotaMediaUseOrder,
  freeQuotaPlanAdmission,
  isLocalQuotaRequest,
  loadFreeQuotaPolicy,
  resolveFreeQuotaAlternative,
  resolveFreeQuotaDecisions,
  type FreeQuotaContext,
} from './free-quota-catalogue';
import { FreeQuotaInventorySchema, eligibleFreeEligibility, loadFreePools } from './free-pools';
type ScanModule0 = typeof import('@/lib/free-quota-authorization');
type ScanModule1 = typeof import('@/lib/server/media-storage');

const mocks = vi.hoisted(() => ({ local: vi.fn(), storageConfigured: vi.fn(() => false) }));

vi.mock('@/lib/free-quota-authorization', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  readLocalQuotaVerification: mocks.local,
}));

vi.mock('@/lib/server/media-storage', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  isGeneratedMediaStorageConfigured: mocks.storageConfigured,
}));

afterEach(() => {
  vi.unstubAllEnvs();
  mocks.storageConfigured.mockReturnValue(false);
});

const NOW = Date.UTC(2026, 8, 21, 12);
const API_KEY = 'fixture-provider-key';
const inventory = loadFreePools().inventory!;
const policy = loadFreeQuotaPolicy();
const reviewedInventory = {
  ...inventory,
  termsReview: {
    terms: {
      commercialUseAllowed: true,
      thirdPartyServingAllowed: true,
      proxyingAllowed: true,
      promptsExcludedFromTraining: true,
    },
    evidenceUrl: 'https://provider.example/terms',
    reviewedBy: 'fixture-reviewer',
    verifiedAtMs: NOW - 60_000,
    expiresAtMs: Date.UTC(2027, 1, 1),
    approvedOfferingKeys: inventory.entries.map((entry) => entry.offeringKey),
  },
};

function context(patch: Partial<FreeQuotaContext> = {}): FreeQuotaContext {
  return {
    store: createMemoryKeyValueStore(),
    apiKey: API_KEY,
    policy,
    nowMs: NOW,
    mediaServed: false,
    ...patch,
  };
}

function attestation(patch: Partial<QuotaAttestation> = {}): QuotaAttestation {
  return {
    sourceUrl: 'https://home.qwencloud.com/benefits',
    checkedAtMs: NOW - 60_000,
    credentialSha256: credentialSha256(API_KEY),
    quotaOnlyOfferings: 'all',
    attestedBy: 'fixture-operator',
    ...patch,
  };
}

async function statuses(value: FreeQuotaContext) {
  const decisions = await resolveFreeQuotaDecisions(value, { inventory: reviewedInventory });
  return new Map(decisions!.offerings.map((item) => [item.entry.offeringKey, item.decision]));
}

async function attested(store: KeyValueStore, patch: Partial<QuotaAttestation> = {}) {
  await writeQuotaAttestation(store, attestation(patch));
  return store;
}

function servableInProduction(entry: (typeof inventory.entries)[number]): boolean {
  const today = new Date(NOW).toISOString().slice(0, 10);
  return (
    entry.quotaOnlyObserved &&
    entry.providerStatus !== 'expired' &&
    (entry.expiresOn === null || entry.expiresOn > today) &&
    getProviderOfferings()[entry.offeringKey]!.quotaProbeProtocol === 'chat'
  );
}

function readyKeys(result: Awaited<ReturnType<typeof statuses>>): string[] {
  return [...result].filter(([, decision]) => decision.status === 'ready').map(([key]) => key);
}

describe('account quota observations', () => {
  it('accounts for every screenshot row without making observations routable', () => {
    expect(inventory.entries).toHaveLength(279);
    expect(inventory.entries.filter((entry) => entry.providerStatus === 'active')).toHaveLength(
      277,
    );
    expect(inventory.entries.filter((entry) => entry.providerStatus === 'expired')).toHaveLength(2);
    expect(eligibleFreeEligibility(NOW)).toEqual({});
    const identities = Object.values(getProviderOfferings());
    expect(identities.filter((entry) => entry.identityStatus === 'unresolved')).toHaveLength(5);
  });

  it('rejects incomplete accounting, unknown identities, duplicate rows and invalid quota units', () => {
    const first = inventory.entries[0]!;
    expect(() => FreeQuotaInventorySchema.parse({ ...inventory, entries: [] })).toThrow();
    for (const patch of [{ offeringKey: 'not-in-catalogue' }, { unit: 'dollars' }]) {
      expect(() =>
        FreeQuotaInventorySchema.parse({
          ...inventory,
          entries: [{ ...first, ...patch }, ...inventory.entries.slice(1)],
        }),
      ).toThrow();
    }
    expect(() =>
      FreeQuotaInventorySchema.parse({
        ...inventory,
        entries: [first, ...inventory.entries.slice(0, -1)],
      }),
    ).toThrow();
  });

  it('keeps the laptop evidence file to loopback requests in development', () => {
    expect(isLocalQuotaRequest('http://localhost:3100/api/models/free-quota', 'development')).toBe(
      true,
    );
    expect(isLocalQuotaRequest('http://[::1]/api/models/free-quota', 'development')).toBe(true);
    expect(isLocalQuotaRequest('http://localhost:3100/api/models/free-quota', 'production')).toBe(
      false,
    );
    expect(
      isLocalQuotaRequest('https://agiworkforce.com/api/models/free-quota', 'development'),
    ).toBe(false);
  });
});

describe('a free quota model is offered only on current quota-only evidence', () => {
  it('keeps the shipped inventory unavailable even after account attestation while terms review is absent', async () => {
    const decisions = await resolveFreeQuotaDecisions(
      context({ store: await attested(createMemoryKeyValueStore()) }),
    );
    expect(decisions!.offerings.some((item) => item.decision.status === 'ready')).toBe(false);
    expect(
      decisions!.offerings.some(
        (item) =>
          item.decision.status === 'unavailable' && item.decision.reason === 'terms_review_missing',
      ),
    ).toBe(true);
  });

  it('offers nothing in the inventory until the account owner attests the setting', async () => {
    const result = await statuses(context());
    expect(result.size).toBe(inventory.entries.length);
    expect(readyKeys(result)).toEqual([]);
    expect(
      [...result.values()].some(
        (decision) =>
          decision.status === 'unavailable' && decision.reason === 'attestation_missing',
      ),
    ).toBe(true);
  });

  it('offers only rows observed quota-only, unexpired and chat, even when everything is attested', async () => {
    const result = await statuses(context({ store: await attested(createMemoryKeyValueStore()) }));
    const ready = readyKeys(result);
    expect(ready.length).toBeGreaterThan(0);
    for (const entry of inventory.entries) {
      const offering = getProviderOfferings()[entry.offeringKey]!;
      expect(ready.includes(entry.offeringKey), entry.offeringKey).toBe(
        servableInProduction(entry) && !sharesManagedRoute(offering),
      );
    }
  });

  it('never offers a model a paid route also serves, because paid traffic spends the same allowance unmetered', async () => {
    const shared = inventory.entries
      .filter(
        (entry) =>
          servableInProduction(entry) &&
          sharesManagedRoute(getProviderOfferings()[entry.offeringKey]!),
      )
      .map((entry) => entry.offeringKey);
    expect(shared.length).toBeGreaterThan(0);
    for (const quotaOnlyOfferings of ['all', shared] as const) {
      const result = await statuses(
        context({ store: await attested(createMemoryKeyValueStore(), { quotaOnlyOfferings }) }),
      );
      for (const key of shared) {
        expect(result.get(key)).toEqual({
          status: 'unavailable',
          reason: 'managed_route_shares_allowance',
        });
      }
    }
  });

  it.each([
    ['stale', { checkedAtMs: NOW - policy.attestationMaxAgeMs }],
    ['from the future', { checkedAtMs: NOW + 60_000 }],
    ['bound to another key', { credentialSha256: credentialSha256('another-key') }],
  ])('offers nothing on an attestation that is %s', async (_label, patch) => {
    const result = await statuses(
      context({ store: await attested(createMemoryKeyValueStore(), patch) }),
    );
    expect(readyKeys(result)).toEqual([]);
  });

  it('keeps serving through the renewal reminder window and stops when the check runs out', async () => {
    const checkedAtMs =
      NOW - policy.attestationMaxAgeMs + policy.attestationReminderLeadMs - 60_000;
    const store = await attested(createMemoryKeyValueStore(), { checkedAtMs });
    expect(readyKeys(await statuses(context({ store })))).not.toEqual([]);
    const lapsedAtMs = checkedAtMs + policy.attestationMaxAgeMs;
    expect(readyKeys(await statuses(context({ store, nowMs: lapsedAtMs })))).toEqual([]);
  });

  it('offers only the offerings an attestation names', async () => {
    const named = readyKeys(
      await statuses(context({ store: await attested(createMemoryKeyValueStore()) })),
    ).slice(0, 2);
    const result = await statuses(
      context({
        store: await attested(createMemoryKeyValueStore(), { quotaOnlyOfferings: named }),
      }),
    );
    expect(readyKeys(result)).toEqual(named);
  });

  it('offers nothing without a credential or a shared state store', async () => {
    const store = await attested(createMemoryKeyValueStore());
    expect(readyKeys(await statuses(context({ store, apiKey: '' })))).toEqual([]);
    expect(readyKeys(await statuses(context({ store: null })))).toEqual([]);
  });

  it('withdraws every model on an account billing signal until a newer attestation', async () => {
    const store = await attested(createMemoryKeyValueStore());
    await recordFreeQuotaSuspension(store, { apiKey: API_KEY, signal: 'Arrearage', nowMs: NOW });
    expect(readyKeys(await statuses(context({ store })))).toEqual([]);
    await writeQuotaAttestation(store, attestation({ checkedAtMs: NOW + 1 }));
    expect(readyKeys(await statuses(context({ store, nowMs: NOW + 2 })))).not.toEqual([]);
  });

  it('reports a model the provider refused as exhausted for every account', async () => {
    const store = await attested(createMemoryKeyValueStore());
    const [target] = readyKeys(await statuses(context({ store })));
    await recordFreeQuotaHold(store, {
      apiKey: API_KEY,
      offeringKey: target!,
      cause: 'billing',
      nowMs: NOW,
    });
    const result = await statuses(context({ store }));
    expect(result.get(target!)).toEqual({ status: 'exhausted', cause: 'provider' });
  });

  it('reports a model whose endpoint the provider retired as ended for every account', async () => {
    const store = await attested(createMemoryKeyValueStore());
    const [target] = readyKeys(await statuses(context({ store })));
    await recordFreeQuotaHold(store, {
      apiKey: API_KEY,
      offeringKey: target!,
      cause: 'withdrawn',
      nowMs: NOW,
    });
    expect((await statuses(context({ store }))).get(target!)).toEqual({ status: 'expired' });
  });

  it('offers a retired model again once a console check newer than the retirement is recorded', async () => {
    const store = await attested(createMemoryKeyValueStore());
    const [target] = readyKeys(await statuses(context({ store })));
    await recordFreeQuotaHold(store, {
      apiKey: API_KEY,
      offeringKey: target!,
      cause: 'withdrawn',
      nowMs: NOW,
    });
    await writeQuotaAttestation(store, attestation({ checkedAtMs: NOW + 1 }));
    const after = await statuses(context({ store, nowMs: NOW + 2 }));
    expect(after.get(target!)?.status).toBe('ready');
  });

  it('reports a model the provider denied as unavailable, not ended, until a newer console check', async () => {
    const store = await attested(createMemoryKeyValueStore());
    const [target] = readyKeys(await statuses(context({ store })));
    await recordFreeQuotaHold(store, {
      apiKey: API_KEY,
      offeringKey: target!,
      cause: 'refused',
      nowMs: NOW,
    });
    expect((await statuses(context({ store }))).get(target!)).toEqual({
      status: 'unavailable',
      reason: 'provider_refused',
    });
    await writeQuotaAttestation(store, attestation({ checkedAtMs: NOW + 1 }));
    expect((await statuses(context({ store, nowMs: NOW + 2 }))).get(target!)?.status).toBe('ready');
  });

  it('keeps a spent model spent when a newer console check is recorded', async () => {
    const store = await attested(createMemoryKeyValueStore());
    const [target] = readyKeys(await statuses(context({ store })));
    await recordFreeQuotaHold(store, {
      apiKey: API_KEY,
      offeringKey: target!,
      cause: 'exhausted',
      nowMs: NOW,
    });
    await writeQuotaAttestation(store, attestation({ checkedAtMs: NOW + 1 }));
    expect((await statuses(context({ store, nowMs: NOW + 2 }))).get(target!)).toEqual({
      status: 'exhausted',
      cause: 'provider',
    });
  });

  it('reports a model as exhausted once the shared allowance cannot fit another turn', async () => {
    const store = await attested(createMemoryKeyValueStore());
    const before = await statuses(context({ store }));
    const [target] = readyKeys(before);
    const decision = before.get(target!)!;
    if (decision.status !== 'ready') throw new Error('expected a ready offering');
    const entry = inventory.entries.find((row) => row.offeringKey === target)!;
    await reserveFreeQuotaAllowance(store, {
      apiKey: API_KEY,
      observedOn: inventory.observedOn,
      offeringKey: target!,
      expiresOn: entry.expiresOn,
      units: decision.usable - policy.minimumChatQuota + 1,
      usable: decision.usable,
      nowMs: NOW,
    });
    expect((await statuses(context({ store }))).get(target!)).toEqual({
      status: 'exhausted',
      cause: 'allowance',
    });
  });

  it('keeps image and video generation to local development', async () => {
    const store = await attested(createMemoryKeyValueStore());
    const media = inventory.entries.filter((entry) => {
      const protocol = getProviderOfferings()[entry.offeringKey]!.quotaProbeProtocol;
      return protocol && protocol !== 'chat' && entry.quotaOnlyObserved;
    });
    expect(media.length).toBeGreaterThan(0);
    const production = await statuses(context({ store }));
    const local = await statuses(context({ store, mediaServed: true }));
    for (const entry of media) {
      expect(production.get(entry.offeringKey)!.status).not.toBe('ready');
    }
    expect(media.some((entry) => local.get(entry.offeringKey)!.status === 'ready')).toBe(true);
  });

  it('withdraws a model at its provider retirement while its allocation still runs', async () => {
    const store = await attested(createMemoryKeyValueStore());
    const ready = readyKeys(await statuses(context({ store })));
    const retiring = ready.find((key) => getProviderOfferings()[key]!.retiresAt !== undefined)!;
    const staying = ready.find((key) => getProviderOfferings()[key]!.retiresAt === undefined)!;
    const retiresAtMs = Date.parse(getProviderOfferings()[retiring]!.retiresAt!);
    const entry = inventory.entries.find((row) => row.offeringKey === retiring)!;
    expect(entry.expiresOn! > new Date(retiresAtMs).toISOString().slice(0, 10)).toBe(true);

    const before = await statuses(context({ store, nowMs: retiresAtMs - 1 }));
    const after = await statuses(context({ store, nowMs: retiresAtMs }));

    expect(before.get(retiring)!.status).toBe('ready');
    expect(after.get(retiring)).toEqual({ status: 'expired' });
    expect(after.get(staying)!.status).toBe('ready');
  });

  it('publishes the retirement date when it comes before the allocation ends', async () => {
    const decisions = await resolveFreeQuotaDecisions(
      context({ store: await attested(createMemoryKeyValueStore()) }),
      { inventory: reviewedInventory },
    );
    const catalogue = buildFreeQuotaCatalogue(decisions!);
    for (const model of catalogue.models) {
      const retiresAt = getProviderOfferings()[model.key]!.retiresAt;
      const entry = inventory.entries.find((row) => row.offeringKey === model.key)!;
      if (!retiresAt || (entry.expiresOn !== null && entry.expiresOn <= retiresAt.slice(0, 10))) {
        expect(model.expiresOn, model.key).toBe(entry.expiresOn);
      } else {
        expect(model.expiresOn, model.key).toBe(retiresAt.slice(0, 10));
      }
    }
    expect(
      catalogue.models.some((model) => {
        const entry = inventory.entries.find((row) => row.offeringKey === model.key)!;
        return model.expiresOn !== entry.expiresOn;
      }),
    ).toBe(true);
  });

  it('expires snapshot allocations even when their captured status was active', async () => {
    const result = await statuses(
      context({
        store: await attested(createMemoryKeyValueStore(), { checkedAtMs: Date.UTC(2027, 0, 1) }),
        nowMs: Date.UTC(2027, 0, 1, 1),
      }),
    );
    expect([...result.values()].every((decision) => decision.status === 'expired')).toBe(true);
  });

  it('publishes the issuer and one status per inventory row', async () => {
    const decisions = await resolveFreeQuotaDecisions(
      context({ store: await attested(createMemoryKeyValueStore()) }),
      { inventory: reviewedInventory },
    );
    const catalogue = buildFreeQuotaCatalogue(decisions!);
    expect(catalogue.issuer).toBe(inventory.issuer);
    const inventoryOrder = inventory.entries.map((entry) => entry.offeringKey);
    const listed = catalogue.models.map((model) => model.key);
    expect([...listed].sort()).toEqual([...inventoryOrder].sort());
    expect(new Set(catalogue.models.map((model) => model.status))).toEqual(
      new Set(['ready', 'expired', 'unavailable']),
    );
  });

  it('lists the allowance that ends soonest first and keeps inventory order within a day', async () => {
    const decisions = await resolveFreeQuotaDecisions(
      context({ store: await attested(createMemoryKeyValueStore()) }),
      { inventory: reviewedInventory },
    );
    const { models } = buildFreeQuotaCatalogue(decisions!);
    const ends = models.map((model) => model.expiresOn);
    const dated = ends.filter((end): end is string => end !== null);

    expect(new Set(dated).size).toBeGreaterThan(1);
    expect(dated).toEqual([...dated].sort());
    expect(ends.slice(dated.length).every((end) => end === null)).toBe(true);
    const inventoryIndex = new Map(
      inventory.entries.map((entry, index) => [entry.offeringKey, index]),
    );
    for (let index = 1; index < models.length; index += 1) {
      if (models[index]!.expiresOn !== models[index - 1]!.expiresOn) continue;
      expect(inventoryIndex.get(models[index]!.key)!).toBeGreaterThan(
        inventoryIndex.get(models[index - 1]!.key)!,
      );
    }
  });

  it('lets the laptop evidence file stand in only on a loopback development request', async () => {
    const [key] = readyKeys(
      await statuses(context({ store: await attested(createMemoryKeyValueStore()) })),
    );
    mocks.local.mockResolvedValue({
      localUserId: 'fixture-user',
      sourceUrl: 'https://home.qwencloud.com/benefits',
      checkedAtMs: NOW - 60_000,
      credentialSha256: credentialSha256(API_KEY),
      offerings: [
        {
          offeringKey: key!,
          quotaOnly: true,
          unit: 'tokens',
          remaining: 5_000,
          expiresAtMs: NOW + 1,
        },
      ],
    });
    const local = 'http://localhost:3100/api/models/free-quota';
    vi.stubEnv('NODE_ENV', 'development');
    const owner = freeQuotaContextFor({ url: local, userId: 'fixture-user', nowMs: NOW });
    expect(owner.mediaServed).toBe(true);
    expect(
      readyKeys(await statuses({ ...owner, store: createMemoryKeyValueStore(), apiKey: API_KEY })),
    ).toEqual([key]);
    const stranger = freeQuotaContextFor({ url: local, userId: 'another-user', nowMs: NOW });
    expect(
      readyKeys(
        await statuses({ ...stranger, store: createMemoryKeyValueStore(), apiKey: API_KEY }),
      ),
    ).toEqual([]);

    vi.stubEnv('NODE_ENV', 'production');
    const hosted = freeQuotaContextFor({ url: local, userId: 'fixture-user', nowMs: NOW });
    expect(hosted.mediaServed).toBe(false);
    expect(
      readyKeys(await statuses({ ...hosted, store: createMemoryKeyValueStore(), apiKey: API_KEY })),
    ).toEqual([]);
  });

  it('serves hosted free media only when private generated-media storage is configured', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const url = 'https://agiworkforce.com/api/models/free-quota';
    expect(freeQuotaContextFor({ url, userId: 'fixture-user', nowMs: NOW }).mediaServed).toBe(
      false,
    );

    mocks.storageConfigured.mockReturnValue(true);
    expect(freeQuotaContextFor({ url, userId: 'fixture-user', nowMs: NOW }).mediaServed).toBe(true);
  });
});

describe('which plan may use a free quota offering, and on which terms', () => {
  const PLANS = Object.keys(BILLING_PLAN_PRICING);
  const offer = { dailyCapPerUser: { image: 5, video: 1 } };
  const planHas = (plan: string, capability: BillingPlanCapability) =>
    (BILLING_PLAN_CAPABILITY_TIERS[capability] as readonly string[]).includes(plan);

  it('keeps every plan exactly where it was while the limited offer is not configured', () => {
    for (const plan of PLANS) {
      expect(freeQuotaPlanAdmission(plan, 'chat', undefined), plan).toEqual(
        isFreeBillingPlanTier(plan) ? { terms: 'included' } : null,
      );
      expect(freeQuotaPlanAdmission(plan, 'image', undefined), plan).toEqual(
        planHas(plan, 'image_generation') ? { terms: 'included' } : null,
      );
      expect(freeQuotaPlanAdmission(plan, 'video', undefined), plan).toEqual(
        planHas(plan, 'video_generation') ? { terms: 'included' } : null,
      );
    }
  });

  it('admits a managed cloud plan without the paid capability on limited terms, and no other', () => {
    const limited: string[] = [];
    for (const plan of PLANS) {
      const withoutOffer = {
        image: freeQuotaPlanAdmission(plan, 'image', undefined),
        video: freeQuotaPlanAdmission(plan, 'video', undefined),
      };
      for (const category of ['image', 'video'] as const) {
        const admission = freeQuotaPlanAdmission(plan, category, offer);
        if (withoutOffer[category]) {
          expect(admission, `${plan} ${category}`).toEqual({ terms: 'included' });
        } else if (!planHas(plan, 'managed_chat')) {
          expect(admission, `${plan} ${category}`).toBeNull();
        } else {
          limited.push(`${plan} ${category}`);
          expect(admission, `${plan} ${category}`).toEqual({
            terms: 'limited',
            category,
            dailyCap: offer.dailyCapPerUser[category],
          });
        }
      }
      expect(freeQuotaPlanAdmission(plan, 'chat', offer), plan).toEqual(
        freeQuotaPlanAdmission(plan, 'chat', undefined),
      );
      expect(freeQuotaPlanAdmission(plan, 'audio', offer), plan).toBeNull();
    }
    expect(limited).toContain('free image');
    expect(limited).toContain('free video');
    expect(PLANS.filter((plan) => !planHas(plan, 'managed_chat')).length).toBeGreaterThan(0);
    expect(freeQuotaPlanAdmission(null, 'image', offer)).toBeNull();
    expect(freeQuotaPlanAdmission('not-a-plan', 'video', offer)).toBeNull();
  });

  it('treats a cap of zero as no offer for that kind', () => {
    const imagesOnly = { dailyCapPerUser: { image: 5, video: 0 } };
    expect(freeQuotaPlanAdmission('free', 'image', imagesOnly)?.terms).toBe('limited');
    expect(freeQuotaPlanAdmission('free', 'video', imagesOnly)).toBeNull();
  });
});

describe('which free media offering is used first', () => {
  const CATEGORIES = ['image', 'video'] as const;
  const ENDS_SOONER = '2026-10-01';
  const ENDS_LATER = '2026-10-10';
  const LAST_DAY_SERVED = '2026-10-09';
  const ENDS_LATEST_FIRST = [ENDS_LATER, '2026-10-05', ENDS_SOONER];
  type Row = (typeof inventory.entries)[number];

  async function mediaDecisions(
    options: { rows?: readonly Row[]; store?: KeyValueStore; nowMs?: number } = {},
  ) {
    const nowMs = options.nowMs ?? NOW;
    const store = await attested(options.store ?? createMemoryKeyValueStore(), {
      checkedAtMs: nowMs - 60_000,
    });
    const decisions = await resolveFreeQuotaDecisions(
      context({ store, mediaServed: true, nowMs }),
      {
        inventory: options.rows
          ? { ...reviewedInventory, entries: [...options.rows] }
          : reviewedInventory,
      },
    );
    return decisions!;
  }

  async function interchangeableRows(category: (typeof CATEGORIES)[number]): Promise<Row[]> {
    const ready = (await mediaDecisions()).offerings.filter(
      ({ offering, decision }) =>
        decision.status === 'ready' && offering.category === category && !offering.retiresAt,
    );
    const rows = ready
      .filter(
        ({ offering }) => offering.quotaProbeProtocol === ready[0]!.offering.quotaProbeProtocol,
      )
      .map(({ entry }) => entry)
      .slice(0, 3);
    expect(rows.length, category).toBeGreaterThan(1);
    return rows;
  }

  function allowanceFor(row: Row, turns: number): Row {
    const perTurn = minimumTurnUnits(getProviderOfferings()[row.offeringKey]!, policy);
    return { ...row, limit: perTurn * turns, consumedApproximate: 0 };
  }

  function endsOn(key: string): string {
    const offering = getProviderOfferings()[key]!;
    const allocationEnds = inventory.entries.find((row) => row.offeringKey === key)!.expiresOn!;
    const retiresOn = offering.retiresAt?.slice(0, 10);
    return retiresOn && retiresOn < allocationEnds ? retiresOn : allocationEnds;
  }

  it('orders ready image and video offerings by the allowance that expires soonest', async () => {
    const decisions = await mediaDecisions();
    const order = freeQuotaMediaUseOrder(decisions);
    const ready = decisions.offerings.filter(
      ({ offering, decision }) =>
        decision.status === 'ready' && ['image', 'video'].includes(offering.category),
    );

    expect(order.length).toBeGreaterThan(1);
    expect([...order].sort()).toEqual(ready.map(({ entry }) => entry.offeringKey).sort());
    const ends = order.map(endsOn);
    expect(ends).toEqual([...ends].sort());
    expect(buildFreeQuotaCatalogue(decisions).mediaUseOrder).toEqual(order);
  });

  it.each(CATEGORIES)(
    'puts the %s offering that ends sooner first, however much allowance a later one has',
    async (category) => {
      const [first, second] = await interchangeableRows(category);
      const rows = [
        { ...allowanceFor(first!, 200), expiresOn: ENDS_LATER },
        { ...allowanceFor(second!, 100), expiresOn: ENDS_SOONER },
      ];

      expect(freeQuotaMediaUseOrder(await mediaDecisions({ rows }))).toEqual([
        second!.offeringKey,
        first!.offeringKey,
      ]);
    },
  );

  it.each(CATEGORIES)(
    'breaks a tie on the %s expiry date by the most allowance left',
    async (category) => {
      const [first, second] = await interchangeableRows(category);
      const rows = [
        { ...allowanceFor(first!, 100), expiresOn: ENDS_LATER },
        { ...allowanceFor(second!, 200), expiresOn: ENDS_LATER },
      ];
      const store = createMemoryKeyValueStore();
      const before = await mediaDecisions({ rows, store });
      const left = new Map(
        before.offerings.map(
          ({ entry, decision }) =>
            [
              entry.offeringKey,
              decision.status === 'ready' ? decision.usable - decision.used : 0,
            ] as const,
        ),
      );

      expect(freeQuotaMediaUseOrder(before)).toEqual([second!.offeringKey, first!.offeringKey]);

      const perTurn = minimumTurnUnits(getProviderOfferings()[second!.offeringKey]!, policy);
      await reserveFreeQuotaAllowance(store, {
        apiKey: API_KEY,
        observedOn: inventory.observedOn,
        offeringKey: second!.offeringKey,
        expiresOn: ENDS_LATER,
        units: left.get(second!.offeringKey)! - left.get(first!.offeringKey)! + perTurn,
        usable: left.get(second!.offeringKey)!,
        nowMs: NOW,
      });

      expect(freeQuotaMediaUseOrder(await mediaDecisions({ rows, store }))).toEqual([
        first!.offeringKey,
        second!.offeringKey,
      ]);
    },
  );

  it.each(CATEGORIES)(
    'offers the soonest-ending ready %s offering left as the alternative',
    async (category) => {
      const listed = await interchangeableRows(category);
      const rows = listed.map((row, index) => ({
        ...allowanceFor(row, 100),
        expiresOn: ENDS_LATEST_FIRST[index]!,
      }));
      const soonestFirst = [...listed].reverse().map((row) => row.offeringKey);
      const store = await attested(createMemoryKeyValueStore());

      expect(freeQuotaMediaUseOrder(await mediaDecisions({ rows, store }))).toEqual(soonestFirst);
      const alternative = await resolveFreeQuotaAlternative(context({ store, mediaServed: true }), {
        inventory: { ...reviewedInventory, entries: rows },
        refusedKey: soonestFirst[0]!,
        needsImageInput: false,
      });
      expect(alternative).toBe(soonestFirst[1]);
    },
  );

  it.each(CATEGORIES)(
    'reports the limited %s offer only while it is configured and an offering is ready, with the last UTC day one is served',
    async (category) => {
      const [first, second] = await interchangeableRows(category);
      const rows = [
        { ...allowanceFor(first!, 100), expiresOn: ENDS_LATER },
        { ...allowanceFor(second!, 100), expiresOn: ENDS_SOONER },
      ];
      const catalogue = buildFreeQuotaCatalogue(await mediaDecisions({ rows }));
      const offer = { dailyCapPerUser: { image: 5, video: 1 } };

      expect(freeMediaOfferFor(catalogue, offer, category)).toEqual({ lastDay: LAST_DAY_SERVED });
      const endOfLastDay = Date.parse(`${LAST_DAY_SERVED}T23:59:59.999Z`);
      const statusAt = async (nowMs: number) =>
        (await mediaDecisions({ rows, nowMs })).offerings.find(
          ({ entry }) => entry.offeringKey === first!.offeringKey,
        )!.decision.status;
      expect(await statusAt(endOfLastDay)).toBe('ready');
      expect(await statusAt(endOfLastDay + 1)).toBe('expired');

      expect(freeMediaOfferFor(catalogue, undefined, category)).toBeNull();
      expect(
        freeMediaOfferFor(catalogue, { dailyCapPerUser: { image: 0, video: 0 } }, category),
      ).toBeNull();
      expect(freeMediaOfferFor(null, offer, category)).toBeNull();

      const unattested = buildFreeQuotaCatalogue(
        (await resolveFreeQuotaDecisions(context({ mediaServed: true }), {
          inventory: { ...reviewedInventory, entries: rows },
        }))!,
      );
      expect(freeMediaOfferFor(unattested, offer, category)).toBeNull();
    },
  );
});

describe('which free chat allocation a Free Auto turn spends first', () => {
  const ranking = inventory.freeAutoFallback!.offeringKeys;

  async function readyChat(store: KeyValueStore = createMemoryKeyValueStore()) {
    const decisions = await resolveFreeQuotaDecisions(context({ store: await attested(store) }), {
      inventory: reviewedInventory,
    });
    return decisions!.offerings.filter(
      ({ offering, decision }) => decision.status === 'ready' && offering.category === 'chat',
    );
  }

  function endsOn(candidate: Awaited<ReturnType<typeof readyChat>>[number]): string {
    const retiresOn = candidate.offering.retiresAt?.slice(0, 10);
    const allocationEnds = candidate.entry.expiresOn!;
    return retiresOn && retiresOn < allocationEnds ? retiresOn : allocationEnds;
  }

  it('orders every ready chat allocation by the day it ends, soonest first', async () => {
    const ready = await readyChat();
    const order = freeQuotaChatUseOrder(ready, ranking);

    expect(order.length).toBeGreaterThan(ranking.length);
    expect(order.map(({ entry }) => entry.offeringKey).sort()).toEqual(
      ready.map(({ entry }) => entry.offeringKey).sort(),
    );
    const ends = order.map(endsOn);
    expect(new Set(ends).size).toBeGreaterThan(1);
    expect(ends).toEqual([...ends].sort());
  });

  it('keeps the configured ranking among allocations that end on the same day, ahead of the ones it leaves out', async () => {
    const order = freeQuotaChatUseOrder(await readyChat(), ranking);
    const days = [...new Set(order.map(endsOn))];
    let rankedDays = 0;

    for (const day of days) {
      const keys = order
        .filter((item) => endsOn(item) === day)
        .map((item) => item.entry.offeringKey);
      const ranked = ranking.filter((key) => keys.includes(key));
      if (ranked.length > 0) rankedDays += 1;
      expect(keys.slice(0, ranked.length), day).toEqual(ranked);
    }
    expect(rankedDays).toBeGreaterThan(1);
  });

  it('puts an unranked allocation that must think after the ones that need not, each group in inventory order', async () => {
    const order = freeQuotaChatUseOrder(await readyChat(), ranking);
    const days = [...new Set(order.map(endsOn))];
    let mixedDays = 0;

    for (const day of days) {
      const unranked = order.filter(
        (item) => endsOn(item) === day && !ranking.includes(item.entry.offeringKey),
      );
      const thinks = unranked.map((item) => item.offering.quotaThinkingRequired === true);
      if (new Set(thinks).size > 1) mixedDays += 1;
      expect(thinks, day).toEqual([...thinks].sort((left, right) => Number(left) - Number(right)));
      for (const mustThink of [false, true]) {
        const keys = unranked
          .filter((_, index) => thinks[index] === mustThink)
          .map((item) => item.entry.offeringKey);
        expect(keys, day).toEqual([...keys].sort());
      }
    }
    expect(mixedDays).toBeGreaterThan(0);
  });

  it('stays on the allocation it started until that one can take no more', async () => {
    const store = createMemoryKeyValueStore();
    const [first, second] = freeQuotaChatUseOrder(await readyChat(store), ranking);
    const usable = first!.decision.status === 'ready' ? first!.decision.usable : 0;
    const spend = (units: number) =>
      reserveFreeQuotaAllowance(store, {
        apiKey: API_KEY,
        observedOn: inventory.observedOn,
        offeringKey: first!.entry.offeringKey,
        expiresOn: first!.entry.expiresOn,
        units,
        usable,
        nowMs: NOW,
      });

    await spend(Math.floor(usable / 2));
    expect(freeQuotaChatUseOrder(await readyChat(store), ranking)[0]!.entry.offeringKey).toBe(
      first!.entry.offeringKey,
    );

    await spend(usable - Math.floor(usable / 2));
    expect(freeQuotaChatUseOrder(await readyChat(store), ranking)[0]!.entry.offeringKey).toBe(
      second!.entry.offeringKey,
    );
  });
});

describe('how a free image or video offering is described and matched', () => {
  type Row = (typeof inventory.entries)[number];
  type Protocol = NonNullable<ReturnType<typeof protocolOf>>;

  function protocolOf(key: string) {
    return getProviderOfferings()[key]!.quotaProbeProtocol;
  }

  async function served(rows?: readonly Row[]) {
    const decisions = await resolveFreeQuotaDecisions(
      context({ store: await attested(createMemoryKeyValueStore()), mediaServed: true }),
      { inventory: rows ? { ...reviewedInventory, entries: [...rows] } : reviewedInventory },
    );
    return decisions!;
  }

  async function readyRows(protocol: Protocol): Promise<Row[]> {
    const rows = (await served()).offerings
      .filter(
        ({ entry, decision }) =>
          decision.status === 'ready' && protocolOf(entry.offeringKey) === protocol,
      )
      .map(({ entry }) => entry);
    expect(rows.length, protocol).toBeGreaterThan(0);
    return rows;
  }

  it('gives each video its own size and clip length and each image its own size', async () => {
    const { models } = buildFreeQuotaCatalogue(await served());
    const described = new Map<Protocol, number>();
    const clipLengths = new Set<number>();

    for (const model of models) {
      const offering = getProviderOfferings()[model.key]!;
      const protocol = offering.quotaProbeProtocol;
      if (protocol === 'video-async') {
        expect(model.outputSize, model.key).toBe(
          offering.quotaVideoSize ?? `${offering.quotaVideoResolution} ${offering.quotaVideoRatio}`,
        );
        expect(model.durationSeconds, model.key).toBe(offering.quotaVideoSeconds);
        clipLengths.add(model.durationSeconds!);
      } else if (protocol === 'image-sync' || protocol === 'image-async') {
        expect(model.outputSize, model.key).toBe(offering.quotaImageSize);
        expect(model, model.key).not.toHaveProperty('durationSeconds');
      } else {
        expect(model, model.key).not.toHaveProperty('outputSize');
        expect(model, model.key).not.toHaveProperty('durationSeconds');
      }
      if (protocol) described.set(protocol, (described.get(protocol) ?? 0) + 1);
    }

    expect(described.get('video-async')).toBeGreaterThan(0);
    expect(described.get('image-sync')).toBeGreaterThan(0);
    expect(described.get('image-async')).toBeGreaterThan(0);
    expect(clipLengths.size).toBeGreaterThan(1);
    expect([...clipLengths]).not.toContain(policy.videoSeconds);
  });

  it('lists an image offering the provider answers through a polled task as a ready image', async () => {
    const rows = await readyRows('image-async');
    const decisions = await served(rows);
    const catalogue = buildFreeQuotaCatalogue(decisions);

    for (const model of catalogue.models) {
      expect(model, model.key).toMatchObject({
        category: 'image',
        unit: 'images',
        status: 'ready',
        outputSize: getProviderOfferings()[model.key]!.quotaImageSize,
      });
    }
    expect([...catalogue.mediaUseOrder!].sort()).toEqual(rows.map((row) => row.offeringKey).sort());
    expect(
      freeMediaOfferFor(catalogue, { dailyCapPerUser: { image: 5, video: 1 } }, 'image'),
    ).not.toBeNull();
  });

  it.each([
    ['image-sync', 'image-async'],
    ['image-async', 'image-sync'],
  ] as const)(
    'offers a ready %s image as the alternative to a refused %s one',
    async (offered, refused) => {
      const [alternative] = await readyRows(offered);
      const [refusedRow] = await readyRows(refused);
      const store = await attested(createMemoryKeyValueStore());

      expect(
        await resolveFreeQuotaAlternative(context({ store, mediaServed: true }), {
          inventory: { ...reviewedInventory, entries: [refusedRow!, alternative!] },
          refusedKey: refusedRow!.offeringKey,
          needsImageInput: false,
        }),
      ).toBe(alternative!.offeringKey);
    },
  );
});
