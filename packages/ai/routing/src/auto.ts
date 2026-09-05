import {
  modelRegistry,
  type IntrinsicCapabilityName,
  type ModelCapabilityName as RegistryCapabilityName,
  type ModelCapabilityValue,
  type RouteDependentCapabilityName,
} from '@agiworkforce/model-registry';
import {
  evaluateCapabilityAdmission,
  type CapabilityRequirement,
  type EffectiveCapabilityDocument,
} from '@agiworkforce/types';
import { effectiveModelPricing } from './pricing';
import { evaluateModelAccess, type ModelAccessPolicy } from './model-policy';
import {
  effectiveRouteHealth,
  type RouteHealthSnapshot,
  type RoutingRuntimeState,
} from './runtime-state';
import type { TaskFamily } from './task-family';
import {
  resolveTaskFamilyOrdering,
  taskFamilyRoutingStageEnabled,
  type TaskFamilyPolicyEntry,
  type TaskFamilyStageDecision,
} from './task-family-routing';
import type { RoutingTaskType } from './types';

export type RoutingTrustMode = 'local' | 'on_device' | 'byok' | 'managed_cloud';
export type RoutingProfile = 'economy' | 'balanced' | 'premium';
export type IntrinsicCapability = IntrinsicCapabilityName;

export type RouteDependentCapability = RouteDependentCapabilityName;

export type ModelCapabilityName = RegistryCapabilityName;

interface RegistryModel {
  identity: { key: string; provider: string; providerModelId: string };
  lifecycle: { availability: string; deprecated: boolean };
}

export type RouteCacheClass =
  | 'provider_implicit_prompt_cache'
  | 'provider_explicit_prompt_cache'
  | 'gateway_prompt_cache'
  | 'gateway_response_cache'
  | 'no_provider_cache';

export type RouteCommercialStatus =
  | 'agi_direct'
  | 'customer_byok'
  | 'authorized_marketplace'
  | 'free_commercial'
  | 'experimental_only'
  | 'blocked';

export type RouteDataRetention = 'zero_retention' | 'provider_default' | 'conditional' | 'unknown';

interface RegistryRoutePricing {
  currency: string;
  unit: string;
  inputPerMillion?: number;
  outputPerMillion?: number;
  cacheReadPerMillion?: number;
  cacheWritePerMillion?: number;
  cacheWrite1hPerMillion?: number;
}

interface RegistryRoute {
  modelKey: string;
  provider: string;
  providerModelId: string;
  harnessId: string;
  trustModes: RoutingTrustMode[];
  availability: string;
  selectable: boolean;
  isDefault: boolean;
  cacheClass: RouteCacheClass;
  commercialStatus: RouteCommercialStatus;
  dataRetention: RouteDataRetention;
  pricing: RegistryRoutePricing;
}

interface RegistryHarnessFeature {
  implementation: 'implemented' | 'partial' | 'unwired' | 'unavailable' | 'unknown';
}

interface RegistryHarness {
  features: Record<string, RegistryHarnessFeature>;
}

interface RegistryRuntimeProfile {
  trustMode: RoutingTrustMode;
  status: 'implemented' | 'partial' | 'unwired' | 'unavailable';
  features: Record<string, RegistryHarnessFeature>;
  allowedHarnessIds: string[];
}

type RegistryCapabilities = Record<ModelCapabilityName, ModelCapabilityValue>;

interface AutoTaskPolicy {
  requiredCapabilities: IntrinsicCapability[];
  requiredHarnessFeatures: string[];
  minimumContextTokens?: number;
  preferredSlots: Record<RoutingProfile, string[]>;
}

interface AutoPolicy {
  defaultAlias: string;
  fallbackSlot: string;
  profileOrder: RoutingProfile[];
  tierMaximumProfiles: Record<string, RoutingProfile>;
  tierAllowedSlots: Record<string, string[]>;
  providerPolicies: {
    usOnly: { allowedTiers: string[]; excludedProviders: string[] };
  };
  autoProfileByTask?: Partial<Record<RoutingTaskType, RoutingProfile>>;
  aliases: Record<string, { profile: RoutingProfile; computeProfile?: boolean }>;
  continuity: {
    preserveExplicitSelection: boolean;
    preferCurrentModelWhenEligible: boolean;
    preferCurrentRouteForCache: boolean;
    reevaluateOnTaskChange: boolean;
  };
  tasks: Record<RoutingTaskType, AutoTaskPolicy>;
  slots: Record<string, AutoSlotPolicy>;
  taskFamilies?: Record<string, TaskFamilyPolicyEntry>;
}

interface AutoSlotPolicy {
  modelKey: string;
  shadow?: { modelKey: string; dailyRequestCap: number };
  canary?: { modelKey: string; trafficFraction: number };
}

export interface RoutingRegistryView {
  models: Record<string, RegistryModel>;
  routes: Record<string, RegistryRoute>;
  harnesses: Record<string, RegistryHarness>;
  runtimeProfiles: Record<string, RegistryRuntimeProfile>;
  capabilities: Record<string, RegistryCapabilities>;
  limits: Record<string, { contextTokens?: number }>;
  policies: { auto: AutoPolicy };
}

const registry = modelRegistry as unknown as RoutingRegistryView;

export interface AutoRoutingRequest {
  selection?: string | null;
  taskType: RoutingTaskType;
  subscriptionTier?: string | null;
  trustMode: RoutingTrustMode;
  currentModelKey?: string | null;
  previousTaskType?: RoutingTaskType | null;
  requiredCapabilities?: readonly IntrinsicCapability[];
  allowedHarnessIds?: readonly string[];
  runtimeProfileId?: string;
  usOnly?: boolean;
  zeroDataRetentionOnly?: boolean;
  zeroDataRetentionProviders?: ReadonlySet<string>;
  capabilityDocument?: EffectiveCapabilityDocument | null;
  capabilityRequirements?: readonly CapabilityRequirement[];
  fallbackToAutoForCapabilityMismatch?: boolean;
  budgetRemainingCents?: number;
  estimatedInputTokens?: number;
  estimatedOutputTokens?: number;
  taskFamily?: TaskFamily | null;
  enableTaskFamilyStage?: boolean;
  /**
   * Slots to consider FIRST, supplied by the caller for this request only.
   *
   * Reordering, never admission: see `applySlotPreference`. Absent, the
   * default, leaves the ordering exactly as static policy computed it, which
   * is why the TS/Rust conformance fixture is unaffected and the Rust resolver
   * needs no counterpart.
   */
  preferSlots?: readonly string[];
  /**
   * The route that already holds a warm prompt cache for this conversation.
   *
   * Cache affinity is a live, caller-known fact, so it stays out of the
   * compiled catalog for the same reason `preferSlots` does: the TS/Rust
   * conformance fixture never sets it, and the Rust resolver needs no
   * counterpart. Absent, route ranking is pure cost over static policy.
   *
   * Preference, never admission: a warm route still has to clear commercial
   * status, trust mode, harness and health, and it loses to the cheapest route
   * once it costs more than `PREFERRED_ROUTE_COST_CEILING_MULTIPLE` times it.
   */
  preferredRouteId?: string | null;
  /**
   * Live health for the candidate routes, when the caller has a snapshot.
   *
   * Same layering as Free Auto: routing stays pure, and the surface that owns
   * the I/O passes the snapshot in. Missing state means "no signal", which
   * ranks a route as healthy rather than parking it.
   */
  runtimeState?: RoutingRuntimeState | null;
  availableProviderIds?: ReadonlySet<string>;
  /**
   * What the route health store has actually observed, per route id.
   *
   * Read only when observed-health ranking is enabled, and only to REORDER
   * routes the static policy already admitted: a route that lost its required
   * capability is not a route health can promote, and a route health dislikes
   * is still a route this model can be served on.
   */
  observedRouteHealth?: Readonly<Record<string, ObservedRouteHealth>>;
  enableObservedHealthRanking?: boolean;
  /**
   * The workspace administrator's model policy, applied HERE rather than by the
   * caller afterwards.
   *
   * A candidate the workspace may not run never enters the plan, so no later
   * hop, a failover rotation, a cheaper-model downgrade, a route retry, can
   * land on one. `null` means ungoverned, which admits everything: a workspace
   * with no policy, personal scope, or a policy read that deliberately failed
   * open must not lose access to every model.
   */
  organizationPolicy?: ModelAccessPolicy | null;
  /**
   * The id this request is identified by, and the only input canary selection
   * hashes. A stable id means one conversation keeps landing on the same side
   * of the split instead of flipping between the canary and the promoted model
   * turn by turn, and it makes the decision reproducible from the record.
   */
  requestId?: string | null;
  enableCanary?: boolean;
  /**
   * How many requests each slot has already mirrored today, by slot id.
   *
   * Routing stays pure, so the counter lives with the surface that owns the
   * mirroring. Absent means nothing has been mirrored yet, which is the correct
   * reading for a fresh process: the cap is a ceiling on spend, and a caller
   * that cannot count has not spent anything through this router.
   */
  shadowRequestsToday?: Readonly<Record<string, number>>;
}

export interface ObservedRouteHealth {
  /** Share of recent attempts that failed, in [0,1]. */
  failureRate?: number;
  /** Observed median time to first token, in ms. */
  latencyP50Ms?: number;
}

export interface AutoFallbackRoute {
  modelKey: string;
  provider: string;
  providerModelId: string;
  routeId: string;
  harnessId: string;
}

export interface SelectedAutoRoute {
  status: 'selected';
  requestedSelection: string;
  requestedProfile: RoutingProfile | null;
  effectiveProfile: RoutingProfile | null;
  taskType: RoutingTaskType;
  modelKey: string;
  provider: string;
  providerModelId: string;
  routeId: string;
  harnessId: string;
  fallbacks: AutoFallbackRoute[];
  reason:
    | 'explicit'
    | 'continuity'
    | 'preferred_slot'
    | 'fallback_slot'
    | 'capability_fallback'
    | 'task_family_pareto'
    | 'health_fallback'
    | 'canary';
  taskFamilyDecision?: TaskFamilyStageDecision;
  /**
   * A candidate to send a COPY of this request to. Never served: the caller
   * dispatches it, records the outcome under the shadow scope, and throws the
   * answer away. Present only when the selected slot declares a shadow, the
   * stage is enabled, and the slot has room under its daily cap.
   */
  shadow?: ShadowMirror;
}

export interface ShadowMirror {
  slotId: string;
  modelKey: string;
  provider: string;
  providerModelId: string;
  routeId: string;
  harnessId: string;
  dailyRequestCap: number;
}

export interface UnavailableAutoRoute {
  status: 'unavailable';
  code:
    | 'unknown_selection'
    | 'unknown_task'
    | 'unknown_runtime_profile'
    | 'runtime_profile_unavailable'
    | 'runtime_profile_mismatch'
    | 'explicit_model_ineligible'
    | 'mandatory_capability_unavailable'
    | 'no_eligible_route';
  requestedSelection: string;
  requestedProfile: RoutingProfile | null;
  effectiveProfile: RoutingProfile | null;
  taskType: RoutingTaskType;
  reasons: string[];
}

export type AutoRouteDecision = SelectedAutoRoute | UnavailableAutoRoute;

interface RankedRoute {
  routeId: string;
  route: RegistryRoute;
  expectedCents: number;
  healthy: boolean;
  hasCredential: boolean;
  observedPenalty: number;
}

interface EligibilityResult {
  routeId?: string;
  route?: RegistryRoute;
  /** Every admissible route of the chosen model, best first. */
  rankedRoutes: readonly RankedRoute[];
  reasons: string[];
}

function applyRuntimeProfile(
  request: AutoRoutingRequest,
  requestedSelection: string,
): { request: AutoRoutingRequest } | { unavailable: UnavailableAutoRoute } {
  if (!request.runtimeProfileId) return { request };

  const profile = registry.runtimeProfiles[request.runtimeProfileId];
  if (!profile) {
    return {
      unavailable: {
        status: 'unavailable',
        code: 'unknown_runtime_profile',
        requestedSelection,
        requestedProfile: null,
        effectiveProfile: null,
        taskType: request.taskType,
        reasons: [`unknown runtime profile: ${request.runtimeProfileId}`],
      },
    };
  }
  if (profile.status !== 'implemented') {
    return {
      unavailable: {
        status: 'unavailable',
        code: 'runtime_profile_unavailable',
        requestedSelection,
        requestedProfile: null,
        effectiveProfile: null,
        taskType: request.taskType,
        reasons: [`runtime profile ${request.runtimeProfileId} is ${profile.status}`],
      },
    };
  }
  if (profile.trustMode !== request.trustMode) {
    return {
      unavailable: {
        status: 'unavailable',
        code: 'runtime_profile_mismatch',
        requestedSelection,
        requestedProfile: null,
        effectiveProfile: null,
        taskType: request.taskType,
        reasons: [
          `runtime profile ${request.runtimeProfileId} requires ${profile.trustMode}, not ${request.trustMode}`,
        ],
      },
    };
  }

  const allowedHarnessIds = request.allowedHarnessIds
    ? profile.allowedHarnessIds.filter((harnessId) =>
        request.allowedHarnessIds?.includes(harnessId),
      )
    : profile.allowedHarnessIds;
  return { request: { ...request, allowedHarnessIds } };
}

function evaluateSessionCapabilityAdmission(
  request: AutoRoutingRequest,
  requestedSelection: string,
): UnavailableAutoRoute | null {
  const requirements = request.capabilityRequirements ?? [];
  if (requirements.length === 0) return null;

  const mandatory = requirements.filter((requirement) => requirement.strength === 'mandatory');
  const document = request.capabilityDocument;
  if (!document) {
    if (mandatory.length === 0) return null;
    return {
      status: 'unavailable',
      code: 'mandatory_capability_unavailable',
      requestedSelection,
      requestedProfile: null,
      effectiveProfile: null,
      taskType: request.taskType,
      reasons: mandatory.map(
        (requirement) =>
          `mandatory capability ${requirement.capabilityId} cannot be verified: no session capability document was provided`,
      ),
    };
  }

  const admission = evaluateCapabilityAdmission(document, requirements);
  if (admission.admitted) return null;

  return {
    status: 'unavailable',
    code: 'mandatory_capability_unavailable',
    requestedSelection,
    requestedProfile: null,
    effectiveProfile: null,
    taskType: request.taskType,
    reasons: admission.rejected.map(
      (rejection) =>
        `mandatory capability ${rejection.capabilityId} is unavailable (denied by ${rejection.deniedByLayers.join(
          ', ',
        )})${rejection.reason ? `: ${rejection.reason}` : ''}`,
    ),
  };
}

/**
 * Move caller-preferred slots to the front of the ordering.
 *
 * REORDERING ONLY, and structurally so: a preferred slot survives just when
 * `allowedSlots`: the tier's own admission set, straight from
 * `tierAllowedSlots`: already contains it. Nothing is added that the tier could
 * not already reach, and every downstream gate (capability, lifecycle, harness,
 * trust mode, context, affordability) still runs unchanged on the result. This
 * decides what is CONSIDERED FIRST, never what is eligible.
 *
 * WHY A CALLER SUPPLIES THIS AT ALL
 * ---------------------------------
 * Tier-keyed static policy cannot express a preference that applies to some
 * holders of a tier and not others, and the free lane needs exactly that:
 * `normalizeTier` folds `basic`, `hobby` and every unrecognised or absent tier
 * into `free`, so an ordering written into `preferredSlots` for the free tier
 * also changes the default route for paying Basic customers, observed as a 502
 * when a Basic request was handed a route its surface could not serve. The
 * caller knows which holder of the tier it is looking at; the registry cannot.
 *
 * This is the same architectural move `free-auto.ts` documents one layer up:
 * live, caller-known facts stay out of the compiled catalog so the TS/Rust
 * conformance fixture stays reproducible. Absent, this is a no-op.
 */
function applySlotPreference(
  orderedSlots: readonly string[],
  preferSlots: readonly string[] | undefined,
  allowedSlots: ReadonlySet<string>,
): readonly string[] {
  if (!preferSlots || preferSlots.length === 0) return orderedSlots;
  const promoted = preferSlots.filter((slotId) => allowedSlots.has(slotId));
  if (promoted.length === 0) return orderedSlots;
  const promotedSet = new Set(promoted);
  return [...promoted, ...orderedSlots.filter((slotId) => !promotedSet.has(slotId))];
}

function normalizeTier(
  tier: string | null | undefined,
): 'free' | 'pro' | 'max' | 'enterprise' | 'byok' {
  switch ((tier ?? '').toLowerCase()) {
    case 'pro':
    case 'team':
      return 'pro';
    case 'basic':
    case 'hobby':
      return 'free';
    case 'max':
    case 'max_15x':
    case 'max-15x':
    case 'max15x':
    case 'max+':
    case 'max_plus':
    case 'max-plus':
      return 'max';
    case 'enterprise':
      return 'enterprise';
    case 'byok':
      return 'byok';
    default:
      return 'free';
  }
}

const tierGatedSlotsByModelKey = ((): Map<string, string[]> => {
  const policy = registry.policies.auto;
  const tierGatedSlots = new Set(Object.values(policy.tierAllowedSlots).flat());
  const slotsByModelKey = new Map<string, string[]>();
  for (const [slotId, slot] of Object.entries(policy.slots)) {
    if (!tierGatedSlots.has(slotId)) continue;
    slotsByModelKey.set(slot.modelKey, [...(slotsByModelKey.get(slot.modelKey) ?? []), slotId]);
  }
  return slotsByModelKey;
})();

function tierAdmissionRejection(modelKey: string, tier: string): string | null {
  const gatedSlots = tierGatedSlotsByModelKey.get(modelKey);
  if (!gatedSlots) return null;
  const policy = registry.policies.auto;
  const allowedSlots = policy.tierAllowedSlots[tier] ?? [policy.fallbackSlot];
  if (gatedSlots.some((slotId) => allowedSlots.includes(slotId))) return null;
  return `routing slot ${gatedSlots.join(', ')} for model ${modelKey} is not allowed for tier ${tier}`;
}

function clampProfile(
  requested: RoutingProfile,
  maximum: RoutingProfile,
  order: readonly RoutingProfile[],
): RoutingProfile {
  const requestedIndex = order.indexOf(requested);
  const maximumIndex = order.indexOf(maximum);
  return order[Math.min(requestedIndex, maximumIndex)] ?? maximum;
}

const DEFAULT_AFFORDABILITY_OUTPUT_TOKENS = 1000;
const MANAGED_TRUST_MODE: RoutingTrustMode = 'managed_cloud';
const BLOCKED_COMMERCIAL_STATUS: RouteCommercialStatus = 'blocked';
const EXPERIMENTAL_COMMERCIAL_STATUS: RouteCommercialStatus = 'experimental_only';
const ZERO_RETENTION_DATA_RETENTION: RouteDataRetention = 'zero_retention';
const CONDITIONAL_DATA_RETENTION: RouteDataRetention = 'conditional';
const ZERO_DATA_RETENTION_ON_REQUEST_FEATURE = 'zeroDataRetentionOnRequest';
const IMPLEMENTED_FEATURE = 'implemented';
const TOKENS_PER_PRICED_MILLION = 1_000_000;
const CENTS_PER_USD = 100;

/**
 * Share of the input a warm route is assumed to serve from cache.
 *
 * A single number rather than an observed hit rate: the caller knows only that
 * a route served the previous turn, not how much of the prefix survived. Below
 * 1 so a warm route never looks free, above nothing so cache-aware ranking can
 * actually change the answer.
 */
const WARM_ROUTE_CACHE_HIT_FRACTION = 0.9;

/**
 * How much more a warm route may cost before the cheapest route wins anyway.
 *
 * Stickiness is worth paying for only up to a point. Past this multiple the
 * cache saving cannot recover the per-token premium, so affinity yields.
 */
const PREFERRED_ROUTE_COST_CEILING_MULTIPLE = 1.25;

const MAX_FALLBACK_ROUTES = 4;

export const OBSERVED_HEALTH_ENV = 'AGI_ROUTING_OBSERVED_HEALTH';
const OBSERVED_HEALTH_ENABLED_VALUE = '1';

export function observedHealthRankingEnabled(): boolean {
  if (typeof process === 'undefined') return false;
  return process.env?.[OBSERVED_HEALTH_ENV] === OBSERVED_HEALTH_ENABLED_VALUE;
}

export const CANARY_ENV = 'AGI_ROUTING_CANARY';
const CANARY_ENABLED_VALUE = '1';

export function canaryRoutingEnabled(): boolean {
  if (typeof process === 'undefined') return false;
  return process.env?.[CANARY_ENV] === CANARY_ENABLED_VALUE;
}

const FNV_OFFSET_BASIS = 2_166_136_261;
const FNV_PRIME = 16_777_619;
const FNV_BUCKETS = 4_294_967_296;
const NO_SHADOW_REQUESTS = 0;

/**
 * FNV-1a over the request id, folded into [0,1).
 *
 * Deterministic and self-contained on purpose: the same request id must reach
 * the same side of a canary split on every surface, in every process, and in a
 * recorded fixture, without any of them sharing state. Cheap arithmetic rather
 * than a cryptographic digest, because this decides which of two models
 * answers, not anything an attacker gains from predicting.
 */
export function canaryBucket(requestId: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < requestId.length; index += 1) {
    hash ^= requestId.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash / FNV_BUCKETS;
}

/**
 * A request with no id never reaches a canary. Falling back to randomness
 * would make the decision unreproducible, and falling back to "always canary"
 * would hand a candidate the traffic of every caller that forgot to pass one.
 */
function canarySelectsRequest(
  slot: AutoSlotPolicy,
  request: AutoRoutingRequest,
  enabled: boolean,
): boolean {
  if (!enabled || slot.canary === undefined) return false;
  const requestId = request.requestId;
  if (typeof requestId !== 'string' || requestId.length === 0) return false;
  return canaryBucket(requestId) < slot.canary.trafficFraction;
}

function shadowMirror(
  slotId: string,
  slot: AutoSlotPolicy,
  task: AutoTaskPolicy,
  request: AutoRoutingRequest,
  enabled: boolean,
): ShadowMirror | undefined {
  const shadow = slot.shadow;
  if (!enabled || shadow === undefined) return undefined;
  const mirrored = request.shadowRequestsToday?.[slotId] ?? NO_SHADOW_REQUESTS;
  if (mirrored >= shadow.dailyRequestCap) return undefined;
  const eligibility = evaluateEligibility(shadow.modelKey, task, request);
  const route = eligibility.route;
  if (!route || !eligibility.routeId) return undefined;
  return {
    slotId,
    modelKey: shadow.modelKey,
    provider: route.provider,
    providerModelId: route.providerModelId,
    routeId: eligibility.routeId,
    harnessId: route.harnessId,
    dailyRequestCap: shadow.dailyRequestCap,
  };
}

/**
 * Banded rather than continuous, deliberately.
 *
 * Ranking on raw rates makes the order flap on sampling noise: two routes at
 * 0.02 and 0.03 failure are the same route as far as a routing decision goes,
 * and reordering between them churns prompt caches for nothing. Bands are wide
 * enough that only a real difference moves a route.
 */
const OBSERVED_FAILURE_RATE_BAND = 0.25;
const OBSERVED_LATENCY_BAND_MS = 500;
const OBSERVED_LATENCY_BAND_COUNT = 8;
const NO_OBSERVED_PENALTY = 0;

function observedBand(value: number | undefined, width: number, maximum: number): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return 0;
  return Math.min(maximum, Math.floor(value / width));
}

/**
 * Zero when nothing has been observed, so a route with no history ranks exactly
 * as it does today. Absence of signal is not evidence of ill health.
 */
/**
 * The store's snapshots as ranking inputs.
 *
 * `successRate` already excludes capability refusals, so its complement is the
 * share of attempts that actually failed. A snapshot with no samples yields no
 * entry rather than a zero, so "never tried" stays distinct from "never failed".
 */
export function observedRouteHealthFromSnapshots(
  snapshots: Readonly<Record<string, RouteHealthSnapshot>> | undefined,
): Readonly<Record<string, ObservedRouteHealth>> {
  const observed: Record<string, ObservedRouteHealth> = {};
  for (const [routeId, snapshot] of Object.entries(snapshots ?? {})) {
    if (snapshot.sampleCount <= 0) continue;
    observed[routeId] = {
      ...(snapshot.successRate !== undefined ? { failureRate: 1 - snapshot.successRate } : {}),
      ...(snapshot.ttftP50Ms !== undefined ? { latencyP50Ms: snapshot.ttftP50Ms } : {}),
    };
  }
  return observed;
}

export function observedRoutePenalty(
  observed: ObservedRouteHealth | undefined,
  enabled: boolean,
): number {
  if (!enabled || !observed) return NO_OBSERVED_PENALTY;
  const failureBand = observedBand(
    observed.failureRate,
    OBSERVED_FAILURE_RATE_BAND,
    Math.ceil(1 / OBSERVED_FAILURE_RATE_BAND),
  );
  const latencyBand = observedBand(
    observed.latencyP50Ms,
    OBSERVED_LATENCY_BAND_MS,
    OBSERVED_LATENCY_BAND_COUNT - 1,
  );
  return failureBand * OBSERVED_LATENCY_BAND_COUNT + latencyBand;
}

const policyReachableSlots = ((): ReadonlySet<string> => {
  const slots = new Set<string>();
  for (const task of Object.values(registry.policies.auto.tasks)) {
    for (const ordered of Object.values(task.preferredSlots)) {
      for (const slotId of ordered) slots.add(slotId);
    }
  }
  return slots;
})();

const routesByModelKey = ((): Map<string, readonly (readonly [string, RegistryRoute])[]> => {
  const grouped = new Map<string, (readonly [string, RegistryRoute])[]>();
  for (const [routeId, route] of Object.entries(registry.routes)) {
    grouped.set(route.modelKey, [...(grouped.get(route.modelKey) ?? []), [routeId, route]]);
  }
  for (const entries of grouped.values()) {
    entries.sort(([leftId, left], [rightId, right]) => {
      if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1;
      return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
    });
  }
  return grouped;
})();

function routeExpectedCents(
  routeId: string,
  route: RegistryRoute,
  request: AutoRoutingRequest,
): number {
  const inputTokens = request.estimatedInputTokens ?? 0;
  const outputTokens = request.estimatedOutputTokens ?? DEFAULT_AFFORDABILITY_OUTPUT_TOKENS;
  const inputPerMillion = route.pricing.inputPerMillion ?? 0;
  const outputPerMillion = route.pricing.outputPerMillion ?? 0;
  const cacheReadPerMillion = route.pricing.cacheReadPerMillion;
  const warm = request.preferredRouteId === routeId && cacheReadPerMillion !== undefined;
  const effectiveInputPerMillion = warm
    ? (1 - WARM_ROUTE_CACHE_HIT_FRACTION) * inputPerMillion +
      WARM_ROUTE_CACHE_HIT_FRACTION * cacheReadPerMillion
    : inputPerMillion;
  const usd =
    (inputTokens * effectiveInputPerMillion + outputTokens * outputPerMillion) /
    TOKENS_PER_PRICED_MILLION;
  return usd * CENTS_PER_USD;
}

function routeIsHealthy(
  routeId: string,
  route: RegistryRoute,
  request: AutoRoutingRequest,
): boolean {
  const state = request.runtimeState;
  if (!state) return true;
  return effectiveRouteHealth(state, routeId, route.provider).available;
}

function routeHasCredential(route: RegistryRoute, request: AutoRoutingRequest): boolean {
  const availableProviderIds = request.availableProviderIds;
  if (!availableProviderIds) return true;
  return availableProviderIds.has(route.provider);
}

function routeAdmissionRejections(
  routeId: string,
  route: RegistryRoute,
  task: AutoTaskPolicy,
  request: AutoRoutingRequest,
  vendor: string,
): string[] {
  const reasons: string[] = [];
  if (request.organizationPolicy) {
    // Both provider identities: the VENDOR that owns the model and the
    // TRANSPORT this route dispatches through. The evaluator decides what each
    // identity may do, and a block on either one refuses.
    const decision = evaluateModelAccess(request.organizationPolicy, {
      provider: vendor,
      transportProvider: route.provider,
      modelId: route.modelKey,
    });
    if (!decision.allowed) {
      reasons.push(`route ${routeId} is refused by workspace model policy: ${decision.code}`);
    }
  }
  if (route.commercialStatus === BLOCKED_COMMERCIAL_STATUS) {
    reasons.push(`route ${routeId} commercial status is ${route.commercialStatus}`);
  }
  if (
    route.commercialStatus === EXPERIMENTAL_COMMERCIAL_STATUS &&
    request.trustMode === MANAGED_TRUST_MODE
  ) {
    reasons.push(`route ${routeId} is ${route.commercialStatus} and cannot serve managed traffic`);
  }
  if (!route.selectable || route.availability !== 'live') {
    reasons.push(`route ${routeId} is not selectable`);
  }
  if (request.allowedHarnessIds && !request.allowedHarnessIds.includes(route.harnessId)) {
    reasons.push(`harness ${route.harnessId} is not executable on the calling runtime`);
  }
  if (request.zeroDataRetentionOnly) {
    const honoursPerRequest =
      route.dataRetention === CONDITIONAL_DATA_RETENTION &&
      registry.harnesses[route.harnessId]?.features[ZERO_DATA_RETENTION_ON_REQUEST_FEATURE]
        ?.implementation === IMPLEMENTED_FEATURE;
    const isZeroRetention =
      route.dataRetention === ZERO_RETENTION_DATA_RETENTION ||
      honoursPerRequest ||
      (request.zeroDataRetentionProviders?.has(route.provider) ?? false);
    if (!isZeroRetention) {
      reasons.push(`route ${routeId} does not guarantee zero data retention`);
    }
  }

  const harness = registry.harnesses[route.harnessId];
  for (const feature of task.requiredHarnessFeatures) {
    const runtimeProfile = request.runtimeProfileId
      ? registry.runtimeProfiles[request.runtimeProfileId]
      : undefined;
    const implementation = runtimeProfile
      ? runtimeProfile.features[feature]?.implementation
      : harness?.features[feature]?.implementation;
    if (implementation !== 'implemented') {
      reasons.push(
        `${runtimeProfile ? `runtime ${request.runtimeProfileId}` : `harness ${route.harnessId}`} feature ${feature} is ${implementation ?? 'undeclared'}`,
      );
    }
  }

  return reasons;
}

/**
 * Order every admissible route of one canonical model, best first.
 *
 * Never a model substitution: each candidate serves the same canonical model
 * through a different provider, harness and price sheet. Ranking is
 * health, then credential availability, then the route's own expected cost,
 * then the model's default route, then route id, the last two so two
 * equally priced routes cannot reorder between runs or between the
 * TypeScript and Rust resolvers.
 */
function rankRoutes(
  candidates: readonly RankedRoute[],
  request: AutoRoutingRequest,
): readonly RankedRoute[] {
  const ordered = [...candidates].sort((left, right) => {
    if (left.healthy !== right.healthy) return left.healthy ? -1 : 1;
    if (left.hasCredential !== right.hasCredential) return left.hasCredential ? -1 : 1;
    if (left.observedPenalty !== right.observedPenalty) {
      return left.observedPenalty - right.observedPenalty;
    }
    if (left.expectedCents !== right.expectedCents) return left.expectedCents - right.expectedCents;
    if (left.route.isDefault !== right.route.isDefault) return left.route.isDefault ? -1 : 1;
    return left.routeId < right.routeId ? -1 : left.routeId > right.routeId ? 1 : 0;
  });

  const preferredRouteId = request.preferredRouteId;
  if (!preferredRouteId) return ordered;
  const preferredIndex = ordered.findIndex((entry) => entry.routeId === preferredRouteId);
  if (preferredIndex <= 0) return ordered;
  const preferred = ordered[preferredIndex];
  const cheapest = ordered[0];
  if (!preferred || !cheapest || !preferred.healthy) return ordered;
  if (preferred.expectedCents > cheapest.expectedCents * PREFERRED_ROUTE_COST_CEILING_MULTIPLE) {
    return ordered;
  }
  return [preferred, ...ordered.filter((entry) => entry !== preferred)];
}

interface RoutingLane {
  tier: ReturnType<typeof normalizeTier>;
  requestedProfile: RoutingProfile;
  effectiveProfile: RoutingProfile;
  tierSlotOrder: readonly string[];
  allowedSlots: ReadonlySet<string>;
  preferredSlots: readonly string[];
  taskFamilyDecision: TaskFamilyStageDecision;
  orderedSlots: readonly string[];
  paretoHead: ReadonlySet<string>;
}

/**
 * The tier/profile/slot-ordering setup common to every alias-based decision.
 *
 * Extracted so `resolveAutoRoute` and `previewAutoRoute` compute the SAME
 * lane from the SAME inputs: a preview can describe a candidate's tier
 * admission, profile and slot position only if that position came from the
 * exact function that placed it there for the real decision.
 */
function resolveRoutingLane(
  request: AutoRoutingRequest,
  task: AutoTaskPolicy,
  alias: AutoPolicy['aliases'][string],
): RoutingLane {
  const policy = registry.policies.auto;
  const tier = normalizeTier(request.subscriptionTier);
  const maximumProfile = policy.tierMaximumProfiles[tier] ?? 'economy';
  const requestedProfile: RoutingProfile = alias.computeProfile
    ? (policy.autoProfileByTask?.[request.taskType] ?? alias.profile)
    : alias.profile;
  const effectiveProfile = clampProfile(requestedProfile, maximumProfile, policy.profileOrder);
  const tierSlotOrder = policy.tierAllowedSlots[tier] ?? [policy.fallbackSlot];
  const allowedSlots = new Set(tierSlotOrder);
  const preferredSlots = task.preferredSlots[effectiveProfile] ?? [];

  const taskFamilyDecision = resolveTaskFamilyOrdering({
    enabled: request.enableTaskFamilyStage ?? taskFamilyRoutingStageEnabled(),
    family: request.taskFamily ?? null,
    taskType: request.taskType,
    preferredSlots,
    preferredSlotsByProfile: task.preferredSlots,
    profileOrder: policy.profileOrder,
    slots: policy.slots,
    estimateCents: (modelKey) => estimatedRequestCents(modelKey, request),
  });
  const orderedSlots = applySlotPreference(
    taskFamilyDecision.ordering?.slots ?? preferredSlots,
    request.preferSlots,
    allowedSlots,
  );
  const paretoHead = new Set(taskFamilyDecision.ordering?.aboveFloor ?? []);

  return {
    tier,
    requestedProfile,
    effectiveProfile,
    tierSlotOrder,
    allowedSlots,
    preferredSlots,
    taskFamilyDecision,
    orderedSlots,
    paretoHead,
  };
}

function evaluateEligibility(
  modelKey: string,
  task: AutoTaskPolicy,
  request: AutoRoutingRequest,
): EligibilityResult {
  const reasons: string[] = [];
  const model = registry.models[modelKey];
  if (!model) return { rankedRoutes: [], reasons: [`unknown model: ${modelKey}`] };

  if (model.lifecycle.availability !== 'live') {
    reasons.push(`model ${modelKey} availability is ${model.lifecycle.availability}`);
  }
  if (model.lifecycle.deprecated) reasons.push(`model ${modelKey} is deprecated`);
  const tier = normalizeTier(request.subscriptionTier);
  const tierRejection = tierAdmissionRejection(modelKey, tier);
  if (tierRejection) reasons.push(tierRejection);
  const usOnlyPolicy = registry.policies.auto.providerPolicies.usOnly;
  if (
    request.usOnly &&
    usOnlyPolicy.allowedTiers.includes(tier) &&
    usOnlyPolicy.excludedProviders.includes(model.identity.provider)
  ) {
    reasons.push(`provider ${model.identity.provider} is excluded by the US-only policy`);
  }

  const trustModeRoutes = (routesByModelKey.get(modelKey) ?? []).filter(([, route]) =>
    route.trustModes.includes(request.trustMode),
  );
  if (trustModeRoutes.length === 0) {
    reasons.push(`model ${modelKey} has no ${request.trustMode} route`);
    return { rankedRoutes: [], reasons };
  }

  const routeReasons: string[] = [];
  const admissible: RankedRoute[] = [];
  for (const [routeId, route] of trustModeRoutes) {
    const rejections = routeAdmissionRejections(
      routeId,
      route,
      task,
      request,
      model.identity.provider,
    );
    if (rejections.length > 0) {
      routeReasons.push(...rejections);
      continue;
    }
    admissible.push({
      routeId,
      route,
      expectedCents: routeExpectedCents(routeId, route, request),
      healthy: routeIsHealthy(routeId, route, request),
      hasCredential: routeHasCredential(route, request),
      observedPenalty: observedRoutePenalty(
        request.observedRouteHealth?.[routeId],
        request.enableObservedHealthRanking ?? observedHealthRankingEnabled(),
      ),
    });
  }

  const credentialedRoutes = admissible.filter((entry) => entry.hasCredential);
  const routable =
    request.availableProviderIds && credentialedRoutes.length > 0 ? credentialedRoutes : admissible;
  for (const entry of admissible) {
    if (!routable.includes(entry)) {
      routeReasons.push(
        `provider ${entry.route.provider} has no available credential for this request`,
      );
    }
  }

  const capabilities = registry.capabilities[modelKey];
  const requiredCapabilities = [
    ...task.requiredCapabilities,
    ...(request.requiredCapabilities ?? []),
  ];
  for (const capability of new Set(requiredCapabilities)) {
    if (capabilities?.[capability] !== true) {
      reasons.push(`model ${modelKey} lacks intrinsic capability ${capability}`);
    }
  }

  if (
    task.minimumContextTokens !== undefined &&
    (registry.limits[modelKey]?.contextTokens ?? 0) < task.minimumContextTokens
  ) {
    reasons.push(`model ${modelKey} does not meet ${task.minimumContextTokens} context tokens`);
  }

  if (reasons.length > 0) return { rankedRoutes: [], reasons: [...reasons, ...routeReasons] };

  const rankedRoutes = rankRoutes(routable, request);
  const selected = rankedRoutes[0];
  if (!selected) return { rankedRoutes: [], reasons: routeReasons };
  return { routeId: selected.routeId, route: selected.route, rankedRoutes, reasons };
}

function selectedDecision(
  request: AutoRoutingRequest,
  requestedSelection: string,
  requestedProfile: RoutingProfile | null,
  effectiveProfile: RoutingProfile | null,
  modelKey: string,
  eligibility: EligibilityResult,
  reason: SelectedAutoRoute['reason'],
  fallbacks: AutoFallbackRoute[] = [],
  taskFamilyDecision?: TaskFamilyStageDecision,
  shadow?: ShadowMirror,
): SelectedAutoRoute {
  const route = eligibility.route;
  if (!route || !eligibility.routeId) {
    throw new Error('selectedDecision requires an eligible route');
  }
  return {
    status: 'selected',
    requestedSelection,
    requestedProfile,
    effectiveProfile,
    taskType: request.taskType,
    modelKey,
    provider: route.provider,
    providerModelId: route.providerModelId,
    routeId: eligibility.routeId,
    harnessId: route.harnessId,
    fallbacks,
    reason,
    ...(taskFamilyDecision ? { taskFamilyDecision } : {}),
    ...(shadow ? { shadow } : {}),
  };
}

/**
 * The remaining admissible routes of ONE canonical model, one per provider.
 *
 * Not a substitution: every entry serves the model the caller asked for, so an
 * exact-model selection may fail over across these without ever answering with
 * a different model.
 */
function isDispatchableNow(candidate: RankedRoute | undefined): boolean {
  return !candidate || (candidate.healthy && candidate.hasCredential);
}

function toFallbackRoute(modelKey: string, candidate: RankedRoute): AutoFallbackRoute {
  return {
    modelKey,
    provider: candidate.route.provider,
    providerModelId: candidate.route.providerModelId,
    routeId: candidate.routeId,
    harnessId: candidate.route.harnessId,
  };
}

interface FallbackPlan {
  dispatchable: AutoFallbackRoute[];
  parked: AutoFallbackRoute[];
}

function sameModelFallbacks(
  selectedModelKey: string,
  selectedModelRoutes: readonly RankedRoute[],
  seenProviders: Set<string>,
): AutoFallbackRoute[] {
  const plan = sameModelFallbackPlan(selectedModelKey, selectedModelRoutes, seenProviders);
  return [...plan.dispatchable, ...plan.parked];
}

function sameModelFallbackPlan(
  selectedModelKey: string,
  selectedModelRoutes: readonly RankedRoute[],
  seenProviders: Set<string>,
): FallbackPlan {
  const plan: FallbackPlan = { dispatchable: [], parked: [] };
  for (const candidate of selectedModelRoutes) {
    if (seenProviders.has(candidate.route.provider)) continue;
    seenProviders.add(candidate.route.provider);
    const bucket = isDispatchableNow(candidate) ? plan.dispatchable : plan.parked;
    bucket.push(toFallbackRoute(selectedModelKey, candidate));
  }
  return plan;
}

/**
 * Every slot a fallback may draw on, best first, one entry per slot.
 *
 * The request's own ordering leads, then the task's slots at every other
 * profile in the policy's profile order, then the policy fallback slot, then
 * the tier's allowed slots in their authored order, restricted to slots some
 * task policy already names. A slot no task lists is reachable only through a
 * caller preference (the free lane), and a failover must not open that door.
 * Admission is unchanged: each slot still has to be allowed for the tier and
 * its model still has to pass eligibility, so this only decides how far a
 * failover may walk before the request gives up, not what it may reach.
 */
function fallbackCandidateSlots(
  policy: AutoPolicy,
  task: AutoTaskPolicy,
  orderedSlots: readonly string[],
  tierSlotOrder: readonly string[],
): readonly string[] {
  return [
    ...new Set([
      ...orderedSlots,
      ...policy.profileOrder.flatMap((profile) => task.preferredSlots[profile] ?? []),
      policy.fallbackSlot,
      ...tierSlotOrder.filter((slotId) => policyReachableSlots.has(slotId)),
    ]),
  ];
}

/**
 * Ordered failover after the selected route, still one provider per entry.
 *
 * The selected model's OWN other routes come first: reaching the same
 * canonical model through a second provider is not a model substitution, and
 * substituting the model is the more expensive change for the caller. Only
 * once those are exhausted does the slot loop offer a different model.
 */
function buildProviderFallbacks(
  request: AutoRoutingRequest,
  task: AutoTaskPolicy,
  policy: AutoPolicy,
  allowedSlots: ReadonlySet<string>,
  orderedSlots: readonly string[],
  tierSlotOrder: readonly string[],
  selectedModelKey: string,
  selectedProvider: string,
  selectedModelRoutes: readonly RankedRoute[] = [],
): AutoFallbackRoute[] {
  const seenModels = new Set([selectedModelKey]);
  const seenProviders = new Set([selectedProvider]);
  const plan = sameModelFallbackPlan(selectedModelKey, selectedModelRoutes, seenProviders);

  for (const slotId of fallbackCandidateSlots(policy, task, orderedSlots, tierSlotOrder)) {
    if (!allowedSlots.has(slotId)) continue;
    const modelKey = policy.slots[slotId]?.modelKey;
    if (!modelKey || seenModels.has(modelKey)) continue;
    seenModels.add(modelKey);

    const eligibility = evaluateEligibility(modelKey, task, request);
    const best = eligibility.rankedRoutes[0];
    if (!best || seenProviders.has(best.route.provider)) continue;

    seenProviders.add(best.route.provider);
    const bucket = isDispatchableNow(best) ? plan.dispatchable : plan.parked;
    bucket.push(toFallbackRoute(modelKey, best));
  }

  return [...plan.dispatchable, ...plan.parked].slice(0, MAX_FALLBACK_ROUTES);
}

function estimatedRequestCents(modelKey: string, request: AutoRoutingRequest): number {
  const inputTokens = request.estimatedInputTokens ?? 0;
  const outputTokens = request.estimatedOutputTokens ?? DEFAULT_AFFORDABILITY_OUTPUT_TOKENS;
  const pricing = effectiveModelPricing(modelKey, inputTokens);
  const usd = pricing
    ? (inputTokens * pricing.inputCost + outputTokens * pricing.outputCost) / 1_000_000
    : 0;
  return usd * 100;
}

function isAffordable(modelKey: string, request: AutoRoutingRequest): boolean {
  if (request.budgetRemainingCents === undefined) return true;
  return estimatedRequestCents(modelKey, request) <= request.budgetRemainingCents;
}

export function resolveAutoRoute(request: AutoRoutingRequest): AutoRouteDecision {
  const policy = registry.policies.auto;
  const requestedSelection = (request.selection ?? policy.defaultAlias).toLowerCase();
  const capabilityAdmission = evaluateSessionCapabilityAdmission(request, requestedSelection);
  if (capabilityAdmission) return capabilityAdmission;
  const runtimeAdmission = applyRuntimeProfile(request, requestedSelection);
  if ('unavailable' in runtimeAdmission) return runtimeAdmission.unavailable;
  request = runtimeAdmission.request;
  const task = policy.tasks[request.taskType];
  if (!task) {
    return {
      status: 'unavailable',
      code: 'unknown_task',
      requestedSelection,
      requestedProfile: null,
      effectiveProfile: null,
      taskType: request.taskType,
      reasons: [`unknown routing task: ${request.taskType}`],
    };
  }

  const alias = policy.aliases[requestedSelection];
  if (!alias) {
    if (!registry.models[requestedSelection]) {
      return {
        status: 'unavailable',
        code: 'unknown_selection',
        requestedSelection,
        requestedProfile: null,
        effectiveProfile: null,
        taskType: request.taskType,
        reasons: [`unknown model selection: ${requestedSelection}`],
      };
    }
    const eligibility = evaluateEligibility(requestedSelection, task, request);
    if (eligibility.route) {
      return selectedDecision(
        request,
        requestedSelection,
        null,
        null,
        requestedSelection,
        eligibility,
        'explicit',
        sameModelFallbacks(
          requestedSelection,
          eligibility.rankedRoutes,
          new Set([eligibility.route.provider]),
        ),
      );
    }

    const capabilityMismatch = eligibility.reasons.some((reason) =>
      reason.includes('lacks intrinsic capability'),
    );
    if (request.fallbackToAutoForCapabilityMismatch && capabilityMismatch) {
      const fallback = resolveAutoRoute({
        ...request,
        selection: policy.defaultAlias,
        currentModelKey: null,
        fallbackToAutoForCapabilityMismatch: false,
      });
      if (fallback.status === 'selected') {
        return {
          ...fallback,
          requestedSelection,
          requestedProfile: null,
          reason: 'capability_fallback',
        };
      }
    }

    return {
      status: 'unavailable',
      code: 'explicit_model_ineligible',
      requestedSelection,
      requestedProfile: null,
      effectiveProfile: null,
      taskType: request.taskType,
      reasons: eligibility.reasons,
    };
  }

  const {
    tier,
    requestedProfile,
    effectiveProfile,
    tierSlotOrder,
    allowedSlots,
    preferredSlots,
    taskFamilyDecision,
    orderedSlots,
    paretoHead,
  } = resolveRoutingLane(request, task, alias);

  if (
    request.currentModelKey &&
    policy.continuity.preferCurrentModelWhenEligible &&
    (!policy.continuity.reevaluateOnTaskChange ||
      request.previousTaskType === request.taskType ||
      (policy.continuity.preferCurrentRouteForCache &&
        preferredSlots.some(
          (slotId) =>
            allowedSlots.has(slotId) && policy.slots[slotId]?.modelKey === request.currentModelKey,
        )))
  ) {
    const eligibility = evaluateEligibility(request.currentModelKey, task, request);
    if (
      eligibility.route &&
      isDispatchableNow(eligibility.rankedRoutes[0]) &&
      isAffordable(request.currentModelKey, request)
    ) {
      const fallbacks = buildProviderFallbacks(
        request,
        task,
        policy,
        allowedSlots,
        orderedSlots,
        tierSlotOrder,
        request.currentModelKey,
        eligibility.route.provider,
        eligibility.rankedRoutes,
      );
      return selectedDecision(
        request,
        requestedSelection,
        requestedProfile,
        effectiveProfile,
        request.currentModelKey,
        eligibility,
        'continuity',
        fallbacks,
        taskFamilyDecision,
      );
    }
  }

  const reasons: string[] = [];
  const parked: {
    modelKey: string;
    eligibility: EligibilityResult;
    reason: SelectedAutoRoute['reason'];
  }[] = [];
  const canaryEnabled = request.enableCanary ?? canaryRoutingEnabled();
  const selectSlot = (
    modelKey: string,
    eligibility: EligibilityResult,
    reason: SelectedAutoRoute['reason'],
    slotId?: string,
  ): SelectedAutoRoute => {
    const route = eligibility.route;
    if (!route) throw new Error('selectSlot requires an eligible route');
    const fallbacks = buildProviderFallbacks(
      request,
      task,
      policy,
      allowedSlots,
      orderedSlots,
      tierSlotOrder,
      modelKey,
      route.provider,
      eligibility.rankedRoutes,
    );
    const slot = slotId === undefined ? undefined : policy.slots[slotId];
    return selectedDecision(
      request,
      requestedSelection,
      requestedProfile,
      effectiveProfile,
      modelKey,
      eligibility,
      reason,
      fallbacks,
      taskFamilyDecision,
      slotId !== undefined && slot !== undefined
        ? shadowMirror(slotId, slot, task, request, canaryEnabled)
        : undefined,
    );
  };

  /**
   * A canary answers only when it is genuinely dispatchable. Anything else,
   * an ineligible candidate, an open breaker, a missing credential, falls
   * straight through to the slot's promoted model rather than parking the
   * request: the point of keeping a promoted sibling is that pulling the canary
   * costs the caller nothing.
   */
  const canarySelection = (slotId: string): SelectedAutoRoute | undefined => {
    const slot = policy.slots[slotId];
    if (!slot?.canary) return undefined;
    if (!canarySelectsRequest(slot, request, canaryEnabled)) return undefined;
    const eligibility = evaluateEligibility(slot.canary.modelKey, task, request);
    if (!eligibility.route || !isDispatchableNow(eligibility.rankedRoutes[0])) return undefined;
    if (!isAffordable(slot.canary.modelKey, request)) return undefined;
    return selectSlot(slot.canary.modelKey, eligibility, 'canary', slotId);
  };

  for (const slotId of orderedSlots) {
    if (!allowedSlots.has(slotId)) {
      reasons.push(`routing slot ${slotId} is not allowed for tier ${tier}`);
      continue;
    }
    const modelKey = policy.slots[slotId]?.modelKey;
    if (!modelKey) {
      reasons.push(`routing slot ${slotId} is missing`);
      continue;
    }
    const canary = canarySelection(slotId);
    if (canary) return canary;
    const eligibility = evaluateEligibility(modelKey, task, request);
    if (eligibility.route) {
      if (slotId !== policy.fallbackSlot && !isAffordable(modelKey, request)) {
        reasons.push(`model ${modelKey} exceeds the remaining usage budget`);
        continue;
      }
      const reason = paretoHead.has(slotId) ? 'task_family_pareto' : 'preferred_slot';
      if (!isDispatchableNow(eligibility.rankedRoutes[0])) {
        parked.push({ modelKey, eligibility, reason });
        continue;
      }
      return selectSlot(modelKey, eligibility, reason, slotId);
    }
    reasons.push(...eligibility.reasons);
  }

  if (!preferredSlots.includes(policy.fallbackSlot) && allowedSlots.has(policy.fallbackSlot)) {
    const fallbackModelKey = policy.slots[policy.fallbackSlot]?.modelKey;
    if (fallbackModelKey) {
      const canary = canarySelection(policy.fallbackSlot);
      if (canary) return canary;
      const eligibility = evaluateEligibility(fallbackModelKey, task, request);
      if (eligibility.route) {
        if (!isDispatchableNow(eligibility.rankedRoutes[0])) {
          parked.push({ modelKey: fallbackModelKey, eligibility, reason: 'fallback_slot' });
        } else {
          return selectSlot(fallbackModelKey, eligibility, 'fallback_slot', policy.fallbackSlot);
        }
      } else {
        reasons.push(...eligibility.reasons);
      }
    }
  }

  const parkedPick = parked[0];
  if (parkedPick) {
    const considered = new Set(parked.map((entry) => entry.modelKey));
    for (const slotId of fallbackCandidateSlots(policy, task, orderedSlots, tierSlotOrder)) {
      if (!allowedSlots.has(slotId)) continue;
      const modelKey = policy.slots[slotId]?.modelKey;
      if (!modelKey || considered.has(modelKey)) continue;
      considered.add(modelKey);
      const eligibility = evaluateEligibility(modelKey, task, request);
      if (!eligibility.route || !isDispatchableNow(eligibility.rankedRoutes[0])) continue;
      if (slotId !== policy.fallbackSlot && !isAffordable(modelKey, request)) continue;
      return selectSlot(modelKey, eligibility, 'health_fallback', slotId);
    }
    return selectSlot(parkedPick.modelKey, parkedPick.eligibility, parkedPick.reason);
  }
  return {
    status: 'unavailable',
    code: 'no_eligible_route',
    requestedSelection,
    requestedProfile,
    effectiveProfile,
    taskType: request.taskType,
    reasons: [...new Set(reasons)],
  };
}

export interface RoutePreviewScoreFactors {
  /** 1 for the request's own model (explicit/continuity); a slot's share of its lane position otherwise, 0 for a candidate reached only as a fallback. */
  taskFit: number;
  /** Whether the workspace policy, tier gate and US-only policy admit this candidate. */
  policyAllowed: boolean;
  budget: 'affordable' | 'unaffordable' | 'unconstrained';
  /** `observedRoutePenalty` for the candidate's best route; 0 when unobserved or the flag is off. */
  observedHealthPenalty: number;
  /** Whether this candidate is the conversation's current model. */
  continuity: boolean;
  /** The profile lane the candidate was ranked under; `null` for an explicit or continuity pull outside the slot ladder. */
  lane: RoutingProfile | null;
}

export interface RoutePreviewCandidate {
  routeId: string;
  modelKey: string;
  providerId: string;
  admitted: boolean;
  score: RoutePreviewScoreFactors;
  reasons: string[];
}

export interface RoutePreviewExcluded {
  slotId?: string;
  modelKey?: string;
  reason: string;
}

export interface AutoRoutePreview {
  selected: AutoRouteDecision;
  candidates: readonly RoutePreviewCandidate[];
  excluded: readonly RoutePreviewExcluded[];
}

const PREVIEW_PRIMARY_TASK_FIT = 1;
const PREVIEW_NEUTRAL_TASK_FIT = 0;

const POLICY_DENIAL_MARKERS = [
  'is not allowed for tier',
  'refused by workspace model policy',
  'excluded by the US-only policy',
] as const;

/**
 * Explain what `resolveAutoRoute` would decide, without deciding anything.
 *
 * `selected` is `resolveAutoRoute(request)` itself, called directly: the two
 * can never disagree because they are not two computations kept in sync, they
 * are one call. `candidates` and `excluded` are built by walking the SAME lane
 * (`resolveRoutingLane`) over the SAME per-candidate evaluator
 * (`evaluateEligibility`) `resolveAutoRoute` used to reach that answer, so a
 * candidate's admission, route and reasons here are the exact values the real
 * decision was computed from, not a re-derivation of them.
 *
 * Pure and read-only: no field on `AutoRoutingRequest` this function reads is
 * ever written back, and every registry lookup it performs is the same static,
 * in-memory table `resolveAutoRoute` already reads. No upstream provider is
 * ever named or contacted.
 */
export function previewAutoRoute(request: AutoRoutingRequest): AutoRoutePreview {
  const selected = resolveAutoRoute(request);
  const policy = registry.policies.auto;
  const requestedSelection = (request.selection ?? policy.defaultAlias).toLowerCase();

  const capabilityAdmission = evaluateSessionCapabilityAdmission(request, requestedSelection);
  if (capabilityAdmission) {
    return {
      selected,
      candidates: [],
      excluded: [{ reason: capabilityAdmission.reasons.join('; ') }],
    };
  }
  const runtimeAdmission = applyRuntimeProfile(request, requestedSelection);
  if ('unavailable' in runtimeAdmission) {
    return {
      selected,
      candidates: [],
      excluded: [{ reason: runtimeAdmission.unavailable.reasons.join('; ') }],
    };
  }
  const effectiveRequest = runtimeAdmission.request;

  const task = policy.tasks[effectiveRequest.taskType];
  if (!task) {
    return {
      selected,
      candidates: [],
      excluded: [{ reason: `unknown routing task: ${effectiveRequest.taskType}` }],
    };
  }

  const candidates: RoutePreviewCandidate[] = [];
  const excluded: RoutePreviewExcluded[] = [];
  const seen = new Set<string>();

  const record = (
    modelKey: string,
    lane: RoutingProfile | null,
    taskFit: number,
    slotId?: string,
  ): void => {
    if (seen.has(modelKey)) return;
    seen.add(modelKey);
    const model = registry.models[modelKey];
    if (!model) {
      excluded.push({
        ...(slotId !== undefined ? { slotId } : {}),
        modelKey,
        reason: `unknown model: ${modelKey}`,
      });
      return;
    }
    const eligibility = evaluateEligibility(modelKey, task, effectiveRequest);
    const admitted = eligibility.route !== undefined;
    const providerId = eligibility.route?.provider ?? model.identity.provider;
    const routeId = eligibility.routeId ?? '';
    const affordable = isAffordable(modelKey, effectiveRequest);
    const budget: RoutePreviewScoreFactors['budget'] =
      effectiveRequest.budgetRemainingCents === undefined
        ? 'unconstrained'
        : affordable
          ? 'affordable'
          : 'unaffordable';
    const observedHealthPenalty =
      eligibility.rankedRoutes[0]?.observedPenalty ?? NO_OBSERVED_PENALTY;
    const reasons = [...eligibility.reasons];
    if (admitted && budget === 'unaffordable') {
      reasons.push(`model ${modelKey} exceeds the remaining usage budget`);
    }
    if (
      selected.status === 'selected' &&
      selected.modelKey === modelKey &&
      selected.routeId === routeId
    ) {
      reasons.push(`selected via ${selected.reason}`);
    } else if (admitted) {
      reasons.push('admitted but not selected: a higher-ranked candidate was dispatched');
    }
    candidates.push({
      routeId,
      modelKey,
      providerId,
      admitted,
      score: {
        taskFit,
        policyAllowed: !eligibility.reasons.some((entry) =>
          POLICY_DENIAL_MARKERS.some((marker) => entry.includes(marker)),
        ),
        budget,
        observedHealthPenalty,
        continuity: modelKey === effectiveRequest.currentModelKey,
        lane,
      },
      reasons,
    });
  };

  const alias = policy.aliases[requestedSelection];
  if (!alias) {
    record(requestedSelection, null, PREVIEW_PRIMARY_TASK_FIT);
    if (effectiveRequest.fallbackToAutoForCapabilityMismatch) {
      const nested = previewAutoRoute({
        ...effectiveRequest,
        selection: policy.defaultAlias,
        currentModelKey: null,
        fallbackToAutoForCapabilityMismatch: false,
      });
      for (const candidate of nested.candidates) {
        if (!seen.has(candidate.modelKey)) {
          seen.add(candidate.modelKey);
          candidates.push(candidate);
        }
      }
      excluded.push(...nested.excluded);
    }
    return { selected, candidates, excluded };
  }

  const lane = resolveRoutingLane(effectiveRequest, task, alias);
  const { effectiveProfile, allowedSlots, tierSlotOrder, orderedSlots, tier } = lane;

  if (effectiveRequest.currentModelKey) {
    record(effectiveRequest.currentModelKey, effectiveProfile, PREVIEW_PRIMARY_TASK_FIT);
  }

  orderedSlots.forEach((slotId, index) => {
    if (!allowedSlots.has(slotId)) {
      excluded.push({ slotId, reason: `routing slot ${slotId} is not allowed for tier ${tier}` });
      return;
    }
    const slot = policy.slots[slotId];
    const modelKey = slot?.modelKey;
    if (!modelKey) {
      excluded.push({ slotId, reason: `routing slot ${slotId} is missing` });
      return;
    }
    const taskFit = (orderedSlots.length - index) / orderedSlots.length;
    if (slot.canary) record(slot.canary.modelKey, effectiveProfile, taskFit, slotId);
    record(modelKey, effectiveProfile, taskFit, slotId);
  });

  if (allowedSlots.has(policy.fallbackSlot)) {
    const fallbackSlot = policy.slots[policy.fallbackSlot];
    if (fallbackSlot?.modelKey) {
      if (fallbackSlot.canary) {
        record(
          fallbackSlot.canary.modelKey,
          effectiveProfile,
          PREVIEW_NEUTRAL_TASK_FIT,
          policy.fallbackSlot,
        );
      }
      record(
        fallbackSlot.modelKey,
        effectiveProfile,
        PREVIEW_NEUTRAL_TASK_FIT,
        policy.fallbackSlot,
      );
    }
  }

  for (const slotId of fallbackCandidateSlots(policy, task, orderedSlots, tierSlotOrder)) {
    if (!allowedSlots.has(slotId)) continue;
    const modelKey = policy.slots[slotId]?.modelKey;
    if (modelKey) record(modelKey, effectiveProfile, PREVIEW_NEUTRAL_TASK_FIT, slotId);
  }

  return { selected, candidates, excluded };
}
