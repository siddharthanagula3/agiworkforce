/**
 * @agiworkforce/routing
 *
 * Shared heuristic classifier, Indic-script detector, and pricing/promo helpers
 * for the AGI Workforce auto-routing system. Pure-TypeScript, zero side effects,
 * zero shared module state, safe to call from any surface (web, desktop,
 * mobile, extensions).
 *
 * Auto task requirements and slot assignments live in
 * `@agiworkforce/model-registry`; this package owns the pure classifier and
 * trust/capability-aware resolver. The legacy `three-tier-router` is retired.
 *
 * Public API:
 *   - `classifyTaskLocally(message, history, attachments?)`, heuristic taxonomy.
 *   - `applyConversationContext(local, ctx)`, 5-turn sticky pivot.
 *   - `estimateTokens(text, model?)`, provider-specific tokenizer estimates.
 *   - `detectIndicScript(text, threshold?)`, Pool C language gate.
 *   - `isDeprecated(modelId, now?)` / `isPromoExpired(modelId, now?)`, guards.
 *   - `effectiveInputPrice(modelId, now?)` / `effectiveOutputPrice(modelId, now?)`
 *, pricing that auto-switches to `post_promo_prices` past `promo_expires_at`.
 *   - `tokenizerDriftFactor(modelId)` / `ESTIMATE_INFLATION`, tokenizer-drift
 *     inflation for cost/latency re-baselining.
 *   - `classifyTaskFamily(signals)`, deterministic structural task-family fast
 *     path; returns `family: null` when it declines, and the caller must then
 *     run the existing Auto policy unchanged.
 *   - `resolveTaskFamilyOrdering(...)` / `orderPreferredSlotsForTaskFamily(...)`
 *, per-family quality floor plus cost ranking over the ALREADY-ADMITTED
 *     candidate set. The result is always a permutation of that set.
 *   - `decideTaskFamilyContinuity(...)` / `applyTaskFamilyContinuity(...)`.
 *     session stickiness with escalation-only switching.
 *   - `taskFamilyRoutingStageEnabled()` / `TASK_FAMILY_STAGE_ENV`, the
 *     operator flag for the stage. OFF by default.
 *
 * @packageDocumentation
 */

export { applyConversationContext, classifyTaskLocally, estimateTokens } from './classify';
export {
  canaryBucket,
  canaryRoutingEnabled,
  listProfileModelOrder,
  observedHealthRankingEnabled,
  observedRouteHealthFromSnapshots,
  observedRoutePenalty,
  previewAutoRoute,
  resolveAutoRoute,
  resolveTierMaximumProfile,
  unhonouredCapabilityPenalty,
  CANARY_ENV,
  OBSERVED_HEALTH_ENV,
} from './auto';
export type {
  AutoRoutePreview,
  RoutePreviewCandidate,
  RoutePreviewExcluded,
  RoutePreviewScoreFactors,
} from './auto';
export { getAutoCapabilityEnvelope } from './auto-capability-envelope';
export { resolveFreeAutoRoute } from './free-auto';
export type {
  FreeAutoCandidate,
  FreeAutoDecision,
  FreeAutoRejection,
  FreeAutoRejectionReason,
  FreeAutoRequest,
  FreeAutoSelection,
  FreeAutoUnavailable,
} from './free-auto';
export {
  effectiveRouteHealth,
  emptyRuntimeState,
  isFreeEligibilityValid,
  isSelfHealingReason,
} from './runtime-state';
export type {
  FreeEligibility,
  QuotaPool,
  RouteHealth,
  RouteHealthSnapshot,
  RouteOutcome,
  RouteOutcomeClass,
  RouteUnavailabilityReason,
  RoutingRuntimeState,
} from './runtime-state';
export {
  buildRouteHealthSnapshot,
  createRouteHealthStore,
  DEFAULT_ROUTE_HEALTH_CONFIG,
  encodeRouteOutcomeEvent,
  healthyRouteHealthSnapshot,
  isCredentialUnfunded,
  isRouteBreakerOpen,
  isRouteHealthDegraded,
  parseRouteOutcomeEvents,
  resolveCredentialCooldownConfig,
  resolveModelLockoutConfig,
  resolveRouteHealthConfig,
  resolveRouteHealthConfigForScope,
  routeBreakerState,
  routeBreakerStateWithDegradeBand,
  routeHealthEventsKey,
  CREDENTIAL_COOLDOWN_BASE_ENV,
  CREDENTIAL_COOLDOWN_CONSECUTIVE_FAILURES_ENV,
  CREDENTIAL_COOLDOWN_FAILURE_RATE_ENV,
  CREDENTIAL_COOLDOWN_MAX_ENV,
  CREDENTIAL_COOLDOWN_MIN_SAMPLES_ENV,
  CREDENTIAL_COOLDOWN_TRIP_WINDOW_ENV,
  CREDENTIAL_COOLDOWN_WINDOW_ENV,
  MODEL_LOCKOUT_CONSECUTIVE_FAILURES_ENV,
  MODEL_LOCKOUT_COOLDOWN_ENV,
  MODEL_LOCKOUT_FAILURE_RATE_ENV,
  MODEL_LOCKOUT_MAX_COOLDOWN_ENV,
  MODEL_LOCKOUT_MIN_SAMPLES_ENV,
  MODEL_LOCKOUT_TRIP_WINDOW_ENV,
  MODEL_LOCKOUT_WINDOW_ENV,
  ROUTE_BREAKER_CONSECUTIVE_FAILURES_ENV,
  ROUTE_BREAKER_COOLDOWN_ENV,
  ROUTE_BREAKER_FAILURE_RATE_ENV,
  ROUTE_BREAKER_MAX_COOLDOWN_ENV,
  ROUTE_BREAKER_MIN_SAMPLES_ENV,
  ROUTE_HEALTH_TRIP_WINDOW_ENV,
  ROUTE_HEALTH_WINDOW_ENV,
} from './route-health-store';
export type {
  RouteBreakerState,
  RouteHealthKeyValueBatch,
  RouteHealthKeyValueStore,
  RouteHealthConfig,
  RouteHealthScope,
  RouteHealthStore,
  RouteHealthStoreFailure,
  RouteHealthStoreFailureEvent,
  RouteHealthStoreOptions,
  RouteOutcomeEvent,
} from './route-health-store';
export {
  breakerProfileForCredentialClass,
  credentialClassForProvider,
  DEFAULT_BREAKER_PROFILES,
  providerBreakerState,
  providerRouteHealthConfig,
  resilienceScopeForCategory,
  resolveCredentialClass,
  routeHealthConfigFromBreakerProfile,
  routeOutcomeClassForCategory,
  trustModesForProvider,
} from './breaker-profiles';
export type { BreakerProfile, CredentialClass, ResilienceScope } from './breaker-profiles';
export {
  buildCapabilityHealthSnapshot,
  capabilityHealthEventsKey,
  createCapabilityHealthStore,
  DEFAULT_CAPABILITY_HEALTH_CONFIG,
  honouredCapabilitySnapshot,
  resolveCapabilityHealthConfig,
  unhonouredCapabilitiesByRoute,
  CAPABILITY_HEALTH_MISS_THRESHOLD_ENV,
  CAPABILITY_HEALTH_WINDOW_ENV,
} from './capability-health';
export type {
  CapabilityHealthByRoute,
  CapabilityHealthConfig,
  CapabilityHealthKey,
  CapabilityHealthSnapshot,
  CapabilityHealthStore,
  CapabilityHealthStoreFailureEvent,
  CapabilityHealthStoreOptions,
  CapabilityObservationEvent,
  ObservedCapability,
} from './capability-health';
export type {
  AutoCapabilityEnvelope,
  AutoCapabilityEnvelopeRequest,
} from './auto-capability-envelope';
export type {
  AutoRouteDecision,
  AutoFallbackRoute,
  AutoRoutingRequest,
  IntrinsicCapability,
  ObservedRouteHealth,
  RouteCacheClass,
  RouteCommercialStatus,
  RouteDataRetention,
  RoutingProfile,
  RoutingTrustMode,
  SelectedAutoRoute,
  ShadowMirror,
  UnavailableAutoRoute,
} from './auto';
export {
  DEFAULT_INDIC_RATIO_THRESHOLD,
  detectIndicScript,
  type IndicDetectionResult,
  type IndicScript,
} from './indic';
export {
  effectiveInputPrice,
  effectiveOutputPrice,
  ESTIMATE_INFLATION,
  isDeprecated,
  isPromoExpired,
  tokenizerDriftFactor,
} from './pricing';
export { canonicalProvider, evaluateModelAccess, policyRestrictsAnything } from './model-policy';
export type {
  ModelAccessAsk,
  ModelAccessCode,
  ModelAccessDecision,
  ModelAccessPolicy,
} from './model-policy';
export { assessModelSwitchCache } from './model-switch-cache';
export type { ModelSwitchCacheAssessment, ModelSwitchCacheInput } from './model-switch-cache';
export {
  classifyTaskFamily,
  isTaskFamily,
  LONG_CONTEXT_TOKEN_THRESHOLD,
  SIMPLE_CHAT_MAX_CHARS,
  TASK_FAMILIES,
  TASK_FAMILY_INTENDED_TASK_TYPES,
} from './task-family';
export type {
  TaskFamily,
  TaskFamilyClassification,
  TaskFamilyReasonCode,
  TaskFamilySignals,
} from './task-family';
export {
  orderPreferredSlotsForTaskFamily,
  resolveTaskFamilyOrdering,
  slotQualityBand,
  TASK_FAMILY_STAGE_ENV,
  taskFamilyPolicy,
  taskFamilyRoutingStageEnabled,
} from './task-family-routing';
export type {
  TaskFamilyFloorRejection,
  TaskFamilyOrdering,
  TaskFamilyOrderingInput,
  TaskFamilyPolicyEntry,
  TaskFamilyQualityFloor,
  TaskFamilyStageDecision,
  TaskFamilyStageReason,
} from './task-family-routing';
export { applyTaskFamilyContinuity, decideTaskFamilyContinuity } from './task-family-continuity';
export type {
  TaskFamilyContinuityAction,
  TaskFamilyContinuityDecision,
  TaskFamilyContinuityInput,
  TaskFamilyContinuityReason,
  TaskFamilySessionRoute,
} from './task-family-continuity';
export type {
  ClassifierResult,
  ConversationContext,
  RoutingAttachment,
  RoutingMessage,
  RoutingTaskType,
} from './types';
