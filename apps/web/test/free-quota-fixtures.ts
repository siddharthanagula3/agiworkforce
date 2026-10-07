import { getProviderOffering, type ProviderOffering } from '@agiworkforce/types';
import { credentialSha256, decideFreeQuotaOffering } from '@/lib/free-quota-authorization';
import { loadFreeQuotaPolicy } from '@/lib/server/free-quota-catalogue';
import type { FreeQuotaInventory } from '@/lib/server/free-pools';

export interface ServableFreeQuotaOffering {
  key: string;
  offering: ProviderOffering;
}

export function freeQuotaFixtureNow(inventory: FreeQuotaInventory): number {
  return Date.parse(`${inventory.observedOn}T12:00:00.000Z`);
}

export function servableFreeQuotaOfferings(
  inventory: FreeQuotaInventory,
  input: { apiKey: string; nowMs: number },
): ServableFreeQuotaOffering[] {
  const policy = loadFreeQuotaPolicy();
  return inventory.entries.flatMap((entry) => {
    const offering = getProviderOffering(entry.offeringKey);
    if (!offering) return [];
    const decision = decideFreeQuotaOffering({
      entry,
      offering,
      policy,
      nowMs: input.nowMs,
      apiKey: input.apiKey,
      mediaServed: true,
      state: {
        attestation: {
          sourceUrl: 'https://home.qwencloud.com/benefits',
          checkedAtMs: input.nowMs,
          credentialSha256: credentialSha256(input.apiKey),
          quotaOnlyOfferings: 'all',
          attestedBy: 'fixture-operator',
        },
        suspendedAtMs: null,
        holds: new Map(),
        used: new Map(),
      },
      termsReviewed: true,
    });
    return decision.status === 'ready' ? [{ key: entry.offeringKey, offering }] : [];
  });
}
