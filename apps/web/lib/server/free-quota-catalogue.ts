import 'server-only';

import type { KeyValueStore } from '@agiworkforce/key-value';
import { getProviderOffering, type ProviderOffering } from '@agiworkforce/types';
import type { FreeQuotaCatalogue } from '@/features/models/lib/free-quota-types';
import {
  PolicySchema,
  attestationFromVerification,
  decideFreeQuotaOffering,
  readFreeQuotaState,
  readLocalQuotaVerification,
  type FreeQuotaDecision,
  type FreeQuotaPolicy,
  type FreeQuotaState,
  type QuotaAttestation,
} from '@/lib/free-quota-authorization';
import { logger } from '@/lib/logger';
import { getKeyValueProvider, getKeyValueStore } from '@/lib/server/key-value';
import { isFreePlanTier } from '@/lib/services/free-trial-service';
import freePoolsDocument from '@/config/free-pools.json';
import { loadFreePools, type FreeQuotaInventory, type FreeQuotaObservation } from './free-pools';

const SHARED_STORE_PROVIDERS: ReadonlySet<string> = new Set(['upstash', 'redis']);

export interface FreeQuotaContext {
  store: KeyValueStore | null;
  apiKey: string;
  policy: FreeQuotaPolicy;
  nowMs: number;
  mediaServed: boolean;
  localAttestation?: () => Promise<QuotaAttestation | null>;
}

export interface FreeQuotaOfferingDecision {
  entry: FreeQuotaObservation;
  offering: ProviderOffering;
  decision: FreeQuotaDecision;
}

export interface FreeQuotaDecisions {
  inventory: FreeQuotaInventory;
  offerings: FreeQuotaOfferingDecision[];
}

export function loadFreeQuotaPolicy(): FreeQuotaPolicy {
  return PolicySchema.parse(freePoolsDocument.quotaExperimentPolicy);
}

export function isLocalQuotaRequest(url: string, nodeEnv: string | undefined): boolean {
  if (nodeEnv !== 'development') return false;
  return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname);
}

export function freeQuotaPlanAllows(planTier: string | null | undefined): boolean {
  return isFreePlanTier(planTier);
}

export function sharedFreeQuotaStore(nodeEnv: string | undefined): KeyValueStore | null {
  try {
    const store = getKeyValueStore();
    if (!store) return null;
    return SHARED_STORE_PROVIDERS.has(getKeyValueProvider()) || nodeEnv === 'development'
      ? store
      : null;
  } catch (error) {
    logger.error({ error }, '[free-quota] shared state store could not be resolved');
    return null;
  }
}

export function freeQuotaContextFor(request: {
  url: string;
  userId: string;
  nowMs?: number;
}): FreeQuotaContext {
  const nodeEnv = process.env.NODE_ENV;
  const local = isLocalQuotaRequest(request.url, nodeEnv);
  return {
    store: sharedFreeQuotaStore(nodeEnv),
    apiKey: process.env['QWEN_API_KEY'] ?? '',
    policy: loadFreeQuotaPolicy(),
    nowMs: request.nowMs ?? Date.now(),
    mediaServed: local,
    ...(local
      ? {
          localAttestation: async () => {
            const verification = await readLocalQuotaVerification().catch(() => null);
            if (!verification) return null;
            if (verification.localUserId && verification.localUserId !== request.userId) {
              return null;
            }
            return attestationFromVerification(verification);
          },
        }
      : {}),
  };
}

function servable(entry: FreeQuotaObservation): boolean {
  return (
    entry.quotaOnlyObserved && Boolean(getProviderOffering(entry.offeringKey)?.quotaProbeProtocol)
  );
}

async function loadState(
  context: FreeQuotaContext,
  inventory: FreeQuotaInventory,
  entries: readonly FreeQuotaObservation[],
): Promise<FreeQuotaState | null> {
  if (!context.store || !context.apiKey) return null;
  let state: FreeQuotaState;
  try {
    state = await readFreeQuotaState(context.store, {
      apiKey: context.apiKey,
      observedOn: inventory.observedOn,
      offeringKeys: entries.filter(servable).map((entry) => entry.offeringKey),
    });
  } catch (error) {
    logger.error({ error }, '[free-quota] shared state could not be read; nothing is offered');
    return null;
  }
  const local = context.localAttestation ? await context.localAttestation() : null;
  if (local && (!state.attestation || local.checkedAtMs > state.attestation.checkedAtMs)) {
    return { ...state, attestation: local };
  }
  return state;
}

export async function resolveFreeQuotaDecisions(
  context: FreeQuotaContext,
  options: { offeringKey?: string; inventory?: FreeQuotaInventory } = {},
): Promise<FreeQuotaDecisions | null> {
  const inventory = options.inventory ?? loadFreePools().inventory;
  if (!inventory) return null;
  const entries = options.offeringKey
    ? inventory.entries.filter((entry) => entry.offeringKey === options.offeringKey)
    : inventory.entries;
  const state = await loadState(context, inventory, entries);
  return {
    inventory,
    offerings: entries.map((entry) => {
      const offering = getProviderOffering(entry.offeringKey);
      if (!offering) throw new Error('The quota inventory references an unknown offering.');
      return {
        entry,
        offering,
        decision: decideFreeQuotaOffering({
          entry,
          offering,
          policy: context.policy,
          nowMs: context.nowMs,
          apiKey: context.apiKey,
          mediaServed: context.mediaServed,
          state,
        }),
      };
    }),
  };
}

export function buildFreeQuotaCatalogue(decisions: FreeQuotaDecisions): FreeQuotaCatalogue {
  const { inventory } = decisions;
  return {
    issuer: inventory.issuer,
    observedOn: inventory.observedOn,
    evidenceUrl: inventory.evidenceUrl,
    reportedEligible: inventory.reportedEligible,
    reportedUnavailable: inventory.reportedUnavailable,
    models: decisions.offerings.map(({ entry, offering, decision }) => ({
      key: entry.offeringKey,
      displayName: offering.displayName,
      providerModelId: offering.providerModelId,
      category: offering.category,
      limit: entry.limit,
      unit: entry.unit,
      consumedApproximate: entry.consumedApproximate,
      expiresOn: entry.expiresOn,
      status: decision.status,
    })),
  };
}
