import 'server-only';

import type { KeyValueStore } from '@agiworkforce/key-value';
import type { FreeQuotaMediaCategory } from '@agiworkforce/cloud-contracts';
import {
  getProviderOffering,
  getProviderOfferingMediaOutput,
  type ProviderOffering,
  type ProviderOfferingCategory,
} from '@agiworkforce/types';
import {
  freeMediaPlanStanding,
  isFreeMediaCategory,
  readyFreeMediaOffer,
  type FreeMediaCategoryOffer,
} from '@/features/models/lib/free-media-offer';
import type { FreeQuotaCatalogue } from '@/features/models/lib/free-quota-types';
import {
  PolicySchema,
  attestationFromVerification,
  decideFreeQuotaOffering,
  freeQuotaEndsOn,
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
import { isGeneratedMediaStorageConfigured } from '@/lib/server/media-storage';
import freePoolsDocument from '@/config/free-pools.json';
import {
  limitedMediaDailyCap,
  loadFreePools,
  reviewedQuotaOfferingKeys,
  type FreeQuotaInventory,
  type FreeQuotaObservation,
  type LimitedMediaOffer,
} from './free-pools';

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

export type FreeQuotaAdmission =
  { terms: 'included' } | { terms: 'limited'; category: FreeQuotaMediaCategory; dailyCap: number };

export function freeQuotaPlanAdmission(
  planTier: string | null | undefined,
  category: ProviderOfferingCategory,
  offer: LimitedMediaOffer | undefined,
): FreeQuotaAdmission | null {
  if (category === 'chat') return freeQuotaPlanAllows(planTier) ? { terms: 'included' } : null;
  if (!isFreeMediaCategory(category)) return null;
  const standing = freeMediaPlanStanding(planTier, category);
  if (standing === 'included') return { terms: 'included' };
  const dailyCap = limitedMediaDailyCap(offer, category);
  if (dailyCap === null || standing !== 'offer_eligible') return null;
  return { terms: 'limited', category, dailyCap };
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
    mediaServed: local || isGeneratedMediaStorageConfigured(),
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

export function sharedFreeQuotaContext(nowMs: number = Date.now()): FreeQuotaContext {
  return {
    store: sharedFreeQuotaStore(process.env.NODE_ENV),
    apiKey: process.env['QWEN_API_KEY'] ?? '',
    policy: loadFreeQuotaPolicy(),
    nowMs,
    mediaServed: isGeneratedMediaStorageConfigured(),
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
  const reviewed = reviewedQuotaOfferingKeys(inventory, context.nowMs);
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
          termsReviewed: reviewed.has(entry.offeringKey),
        }),
      };
    }),
  };
}

function allowanceLeft(decision: FreeQuotaDecision): number {
  return decision.status === 'ready' ? decision.usable - decision.used : 0;
}

function endingSoonerFirst(
  left: FreeQuotaOfferingDecision,
  right: FreeQuotaOfferingDecision,
): number {
  const leftEnds = freeQuotaEndsOn(left.entry, left.offering);
  const rightEnds = freeQuotaEndsOn(right.entry, right.offering);
  if (leftEnds === rightEnds) return 0;
  if (leftEnds === null) return 1;
  if (rightEnds === null) return -1;
  return leftEnds < rightEnds ? -1 : 1;
}

function expiringCapacityFirst(
  left: FreeQuotaOfferingDecision,
  right: FreeQuotaOfferingDecision,
): number {
  return (
    endingSoonerFirst(left, right) ||
    allowanceLeft(right.decision) - allowanceLeft(left.decision) ||
    left.entry.offeringKey.localeCompare(right.entry.offeringKey)
  );
}

export function freeQuotaChatUseOrder(
  offerings: readonly FreeQuotaOfferingDecision[],
  ranking: readonly string[],
): FreeQuotaOfferingDecision[] {
  const rank = new Map(ranking.map((key, index) => [key, index]));
  const rankOf = (candidate: FreeQuotaOfferingDecision) =>
    rank.get(candidate.entry.offeringKey) ?? ranking.length;
  const thinks = (candidate: FreeQuotaOfferingDecision) =>
    Number(candidate.offering.quotaThinkingRequired === true);
  return [...offerings].sort(
    (left, right) =>
      endingSoonerFirst(left, right) ||
      rankOf(left) - rankOf(right) ||
      thinks(left) - thinks(right) ||
      left.entry.offeringKey.localeCompare(right.entry.offeringKey),
  );
}

export function freeQuotaMediaUseOrder(decisions: Pick<FreeQuotaDecisions, 'offerings'>): string[] {
  return decisions.offerings
    .filter(
      ({ offering, decision }) =>
        decision.status === 'ready' && isFreeMediaCategory(offering.category),
    )
    .sort(expiringCapacityFirst)
    .map(({ entry }) => entry.offeringKey);
}

export function freeMediaOfferFor(
  catalogue: Pick<FreeQuotaCatalogue, 'models'> | null,
  offer: LimitedMediaOffer | undefined,
  category: FreeQuotaMediaCategory,
): FreeMediaCategoryOffer | null {
  if (!catalogue || limitedMediaDailyCap(offer, category) === null) return null;
  return readyFreeMediaOffer(catalogue.models, category);
}

export async function resolveReadyFreeQuotaOffering(
  context: FreeQuotaContext,
  input: {
    inventory: FreeQuotaInventory;
    category: ProviderOfferingCategory;
    needsImageInput: boolean;
    excludeKey?: string;
    ranking?: readonly string[];
    spendExpiringFirst?: boolean;
  },
): Promise<string | null> {
  const decisions = await resolveFreeQuotaDecisions(context, { inventory: input.inventory });
  if (!decisions) return null;
  const candidates = input.spendExpiringFirst
    ? freeQuotaChatUseOrder(decisions.offerings, input.ranking ?? [])
    : input.ranking
      ? input.ranking.flatMap((key) =>
          decisions.offerings.filter(({ entry }) => entry.offeringKey === key),
        )
      : isFreeMediaCategory(input.category)
        ? [...decisions.offerings].sort(expiringCapacityFirst)
        : decisions.offerings;
  const byNameOnly = new Set(input.inventory.chosenOnlyByName ?? []);
  const ready = candidates.find(
    ({ entry, offering, decision }) =>
      entry.offeringKey !== input.excludeKey &&
      !byNameOnly.has(entry.offeringKey) &&
      decision.status === 'ready' &&
      offering.category === input.category &&
      (!input.needsImageInput || offering.quotaChatImageInput === true),
  );
  return ready?.entry.offeringKey ?? null;
}

export async function resolveFreeQuotaAlternative(
  context: FreeQuotaContext,
  input: { inventory: FreeQuotaInventory; refusedKey: string; needsImageInput: boolean },
): Promise<string | null> {
  const refused = getProviderOffering(input.refusedKey);
  if (!refused) return null;
  return resolveReadyFreeQuotaOffering(context, {
    inventory: input.inventory,
    category: refused.category,
    needsImageInput: input.needsImageInput,
    excludeKey: input.refusedKey,
  });
}

export function buildFreeQuotaCatalogue(decisions: FreeQuotaDecisions): FreeQuotaCatalogue {
  const { inventory } = decisions;
  const policy = loadFreeQuotaPolicy();
  return {
    issuer: inventory.issuer,
    observedOn: inventory.observedOn,
    evidenceUrl: inventory.evidenceUrl,
    reportedEligible: inventory.reportedEligible,
    reportedUnavailable: inventory.reportedUnavailable,
    models: [...decisions.offerings]
      .sort(endingSoonerFirst)
      .map(({ entry, offering, decision }) => ({
        key: entry.offeringKey,
        displayName: offering.displayName,
        providerModelId: offering.providerModelId,
        category: offering.category,
        limit: entry.limit,
        unit: entry.unit,
        consumedApproximate: entry.consumedApproximate,
        expiresOn: freeQuotaEndsOn(entry, offering),
        status: decision.status,
        ...(getProviderOfferingMediaOutput(offering, policy.videoSeconds) ?? {}),
      })),
    mediaUseOrder: freeQuotaMediaUseOrder(decisions),
  };
}
