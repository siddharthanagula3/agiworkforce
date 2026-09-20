import { describe, expect, it } from 'vitest';
import { getProviderOfferings } from '@agiworkforce/types';
import { buildFreeQuotaCatalogue, isLocalQuotaRequest } from './free-quota-catalogue';
import { FreeQuotaInventorySchema, eligibleFreeEligibility, loadFreePools } from './free-pools';

const NOW = Date.UTC(2026, 8, 19);

describe('account quota observations', () => {
  it('accounts for every screenshot row without making observations routable', () => {
    const inventory = loadFreePools().inventory!;
    expect(inventory.entries).toHaveLength(272);
    expect(inventory.entries.filter((entry) => entry.providerStatus === 'active')).toHaveLength(
      270,
    );
    expect(inventory.entries.filter((entry) => entry.providerStatus === 'expired')).toHaveLength(2);
    expect(eligibleFreeEligibility(NOW)).toEqual({});
    const identities = Object.values(getProviderOfferings());
    expect(identities.filter((entry) => entry.identityStatus === 'unresolved')).toHaveLength(0);
    expect(
      identities
        .filter((entry) => entry.identityStatus === 'unresolved')
        .every((entry) => entry.providerModelId === null),
    ).toBe(true);
  });

  it('never treats a screenshot toggle as current account-bound authorization', () => {
    const result = buildFreeQuotaCatalogue(loadFreePools().inventory, NOW)!;
    expect(result.models.filter((entry) => entry.status === 'quota_only_off')).toHaveLength(4);
    expect(result.models.filter((entry) => entry.status === 'expired')).toHaveLength(2);
    expect(result.models.filter((entry) => entry.status === 'unresolved')).toHaveLength(0);
    expect(result.models.filter((entry) => entry.status === 'account_check_required')).toHaveLength(
      94,
    );
    expect(result.models.filter((entry) => entry.status === 'integration_required')).toHaveLength(
      172,
    );
  });

  it('expires snapshot allocations even if their captured status was active', () => {
    const result = buildFreeQuotaCatalogue(loadFreePools().inventory, Date.UTC(2027, 0, 1))!;
    expect(result.models.every((entry) => entry.status === 'expired')).toBe(true);
  });

  it('rejects incomplete accounting, unknown identities, duplicate rows and invalid quota units', () => {
    const inventory = loadFreePools().inventory!;
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

  it('keeps the snapshot out of production and non-loopback requests', () => {
    expect(isLocalQuotaRequest('http://localhost:3100/api/models/free-quota', 'development')).toBe(
      true,
    );
    expect(isLocalQuotaRequest('http://127.0.0.1/api/models/free-quota', 'development')).toBe(true);
    expect(isLocalQuotaRequest('http://[::1]/api/models/free-quota', 'development')).toBe(true);
    expect(isLocalQuotaRequest('http://localhost:3100/api/models/free-quota', 'production')).toBe(
      false,
    );
    expect(
      isLocalQuotaRequest('https://agiworkforce.com/api/models/free-quota', 'development'),
    ).toBe(false);
  });
});
