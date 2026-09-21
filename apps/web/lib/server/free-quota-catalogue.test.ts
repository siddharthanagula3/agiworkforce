// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryKeyValueStore, type KeyValueStore } from '@agiworkforce/key-value';
import { getProviderOfferings } from '@agiworkforce/types';
import {
  credentialSha256,
  recordFreeQuotaHold,
  recordFreeQuotaSuspension,
  reserveFreeQuotaAllowance,
  sharesManagedRoute,
  writeQuotaAttestation,
  type QuotaAttestation,
} from '@/lib/free-quota-authorization';
import {
  buildFreeQuotaCatalogue,
  freeQuotaContextFor,
  isLocalQuotaRequest,
  loadFreeQuotaPolicy,
  resolveFreeQuotaDecisions,
  type FreeQuotaContext,
} from './free-quota-catalogue';
import { FreeQuotaInventorySchema, eligibleFreeEligibility, loadFreePools } from './free-pools';

const mocks = vi.hoisted(() => ({ local: vi.fn() }));

vi.mock('@/lib/free-quota-authorization', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/free-quota-authorization')>()),
  readLocalQuotaVerification: mocks.local,
}));

afterEach(() => vi.unstubAllEnvs());

const NOW = Date.UTC(2026, 8, 21, 12);
const API_KEY = 'fixture-provider-key';
const inventory = loadFreePools().inventory!;
const policy = loadFreeQuotaPolicy();

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
  const decisions = await resolveFreeQuotaDecisions(value);
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
    expect(inventory.entries).toHaveLength(272);
    expect(inventory.entries.filter((entry) => entry.providerStatus === 'active')).toHaveLength(
      270,
    );
    expect(inventory.entries.filter((entry) => entry.providerStatus === 'expired')).toHaveLength(2);
    expect(eligibleFreeEligibility(NOW)).toEqual({});
    const identities = Object.values(getProviderOfferings());
    expect(identities.filter((entry) => entry.identityStatus === 'unresolved')).toHaveLength(0);
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
    );
    const catalogue = buildFreeQuotaCatalogue(decisions!);
    expect(catalogue.issuer).toBe(inventory.issuer);
    expect(catalogue.models.map((model) => model.key)).toEqual(
      inventory.entries.map((entry) => entry.offeringKey),
    );
    expect(new Set(catalogue.models.map((model) => model.status))).toEqual(
      new Set(['ready', 'expired', 'unavailable']),
    );
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
});
