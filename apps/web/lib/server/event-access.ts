import 'server-only';

import {
  getModelMetadataById,
  listManagedRoutesForModel,
  normalizeModelId,
} from '@agiworkforce/types';

/**
 * Temporary event access, as an overlay on permanent entitlement.
 *
 *   permanent entitlement OR active event promotion, AND executable
 *
 * It grants TEXT MODEL ACCESS and nothing else. It does not touch tier tables,
 * does not raise a plan, and does not unlock a capability: AGI Work, image,
 * video, research and the developer surfaces keep gating on plan exactly as
 * they did, because they ask `canUseBillingPlanCapability`, which this never
 * reaches. Turning the promotion off restores permanent Free behaviour with no
 * data migration, because nothing here is stored.
 *
 * The backend is authoritative. A client that asks for an event model outside
 * the window is refused by the same gate that refuses any unentitled model.
 */

export const EVENT_ENABLED_ENV = 'AGI_EVENT_ENABLED';
export const EVENT_MODELS_ENV = 'AGI_EVENT_MODELS';
export const EVENT_DISABLED_MODELS_ENV = 'AGI_EVENT_DISABLED_MODELS';
/**
 * Withdraws every promoted model served by these providers, by provider id.
 *
 * Separate from the per-model switch because the failures have different
 * shapes: one model behaving badly is not one supplier being down, expensive or
 * unreliable, and during an event the operator needs to drop a whole supplier
 * without naming each of its models. Deliberately event-scoped: it withdraws
 * the promotion only, so paid customers who bought access to the same provider
 * keep it. Taking a provider away from people who paid for it is a different
 * decision, made with a different control.
 */
export const EVENT_DISABLED_PROVIDERS_ENV = 'AGI_EVENT_DISABLED_PROVIDERS';
export const EVENT_STARTS_AT_ENV = 'AGI_EVENT_STARTS_AT';
export const EVENT_ENDS_AT_ENV = 'AGI_EVENT_ENDS_AT';

/** Only an individual Free account is promoted. Paid plans keep what they bought. */
const PROMOTED_PLAN_TIER = 'free';

export interface EventPromotion {
  active: boolean;
  modelIds: ReadonlySet<string>;
  startsAt: number | null;
  endsAt: number | null;
}

const INACTIVE: EventPromotion = Object.freeze({
  active: false,
  modelIds: new Set<string>(),
  startsAt: null,
  endsAt: null,
});

function readFlag(name: string): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on';
}

function readInstant(name: string): number | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Fail closed on anything the registry does not recognise as a chat-shaped
 * canonical model. A typo in the allowlist must drop that entry, never widen
 * the promotion and never break the catalogue.
 */
function readModelIds(name: string): Set<string> {
  const raw = process.env[name]?.trim();
  if (!raw) return new Set<string>();
  const ids = new Set<string>();
  for (const part of raw.split(',')) {
    const candidate = normalizeModelId(part.trim().toLowerCase());
    if (!candidate) continue;
    const model = getModelMetadataById(candidate);
    if (!model) continue;
    if (model.deprecated === true) continue;
    ids.add(candidate);
  }
  return ids;
}

/**
 * Provider ids are not validated against a registry the way model ids are: an
 * unrecognised entry here can only ever subtract, so a typo costs availability
 * and never widens the promotion. Failing closed is the point.
 */
function readProviderIds(name: string): Set<string> {
  const raw = process.env[name]?.trim();
  if (!raw) return new Set<string>();
  const ids = new Set<string>();
  for (const part of raw.split(',')) {
    const candidate = part.trim().toLowerCase();
    if (candidate) ids.add(candidate);
  }
  return ids;
}

export function readEventPromotion(now: number = Date.now()): EventPromotion {
  if (!readFlag(EVENT_ENABLED_ENV)) return INACTIVE;

  const startsAt = readInstant(EVENT_STARTS_AT_ENV);
  const endsAt = readInstant(EVENT_ENDS_AT_ENV);
  // Server-side window. An operator who forgets to unset the flag still sees
  // the promotion expire on its own.
  if (startsAt !== null && now < startsAt) return INACTIVE;
  if (endsAt !== null && now >= endsAt) return INACTIVE;

  const disabled = readModelIds(EVENT_DISABLED_MODELS_ENV);
  const allowed = readModelIds(EVENT_MODELS_ENV);
  for (const id of disabled) allowed.delete(id);

  // A model survives a disabled supplier if some other supplier can still serve
  // it, which is the same rule the catalogue uses for executability. Only a
  // model left with no permitted route is withdrawn.
  const disabledProviders = readProviderIds(EVENT_DISABLED_PROVIDERS_ENV);
  if (disabledProviders.size > 0) {
    for (const id of [...allowed]) {
      const routes = listManagedRoutesForModel(id);
      if (routes.every((route) => disabledProviders.has(route.provider))) allowed.delete(id);
    }
  }

  if (allowed.size === 0) return INACTIVE;

  return { active: true, modelIds: allowed, startsAt, endsAt };
}

/**
 * Whether the promotion covers this model for this plan.
 *
 * Entitlement only. The caller still has to prove the model is executable, so
 * an allowlisted model whose provider holds no credential stays unselectable:
 * the event changes who may ask, never whether supply exists.
 */
export function eventAllowsModel(
  modelId: string,
  planTier: string | null | undefined,
  promotion: EventPromotion = readEventPromotion(),
): boolean {
  if (!promotion.active) return false;
  if ((planTier ?? '').trim().toLowerCase() !== PROMOTED_PLAN_TIER) return false;
  const canonicalModelId = normalizeModelId(modelId.trim().toLowerCase());
  if (!canonicalModelId) return false;
  return promotion.modelIds.has(canonicalModelId);
}

/** The models the promotion adds for this plan, for badges and copy. */
export function eventModelIdsFor(
  planTier: string | null | undefined,
  promotion: EventPromotion = readEventPromotion(),
): ReadonlySet<string> {
  if (!promotion.active) return new Set<string>();
  if ((planTier ?? '').trim().toLowerCase() !== PROMOTED_PLAN_TIER) return new Set<string>();
  return promotion.modelIds;
}
