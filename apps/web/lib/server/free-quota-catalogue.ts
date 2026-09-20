import 'server-only';

import { getProviderOffering } from '@agiworkforce/types';
import type { FreeQuotaCatalogue, FreeQuotaStatus } from '@/features/models/lib/free-quota-types';
import { loadFreePools, type FreeQuotaInventory } from './free-pools';

export function buildFreeQuotaCatalogue(
  inventory: FreeQuotaInventory | undefined = loadFreePools().inventory,
  nowMs = Date.now(),
): FreeQuotaCatalogue | null {
  if (!inventory) return null;
  const today = new Date(nowMs).toISOString().slice(0, 10);
  return {
    observedOn: inventory.observedOn,
    evidenceUrl: inventory.evidenceUrl,
    reportedEligible: inventory.reportedEligible,
    reportedUnavailable: inventory.reportedUnavailable,
    models: inventory.entries.map((entry) => {
      const offering = getProviderOffering(entry.offeringKey);
      if (!offering) throw new Error('The quota inventory references an unknown offering.');
      let status: FreeQuotaStatus = offering.quotaProbeProtocol
        ? 'account_check_required'
        : 'integration_required';
      if (!entry.quotaOnlyObserved) status = 'quota_only_off';
      if (offering.identityStatus === 'unresolved') status = 'unresolved';
      if (
        entry.providerStatus === 'expired' ||
        (entry.expiresOn !== null && entry.expiresOn <= today)
      ) {
        status = 'expired';
      }
      return {
        key: entry.offeringKey,
        displayName: offering.displayName,
        providerModelId: offering.providerModelId,
        category: offering.category,
        limit: entry.limit,
        unit: entry.unit,
        consumedApproximate: entry.consumedApproximate,
        expiresOn: entry.expiresOn,
        status,
      };
    }),
  };
}

export function isLocalQuotaRequest(url: string, nodeEnv: string | undefined): boolean {
  if (nodeEnv !== 'development') return false;
  return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname);
}
