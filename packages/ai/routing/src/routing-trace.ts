import { modelRegistry } from '@agiworkforce/model-registry';

import {
  canaryRoutingEnabled,
  observedHealthRankingEnabled,
  shadowMirroringEnabled,
  type AutoRouteDecision,
  type AutoRoutingRequest,
  type RoutingRegistryView,
} from './auto';
import { taskFamilyRoutingStageEnabled } from './task-family-routing';

export const ROUTING_TRACE_SCHEMA_VERSION = 1;

export type RoutingCohort = 'control' | 'canary';

export interface RoutingTraceRoute {
  modelKey: string;
  routeId: string;
}

export interface RoutingDecisionTrace {
  schemaVersion: typeof ROUTING_TRACE_SCHEMA_VERSION;
  requestId: string | null;
  selection: string;
  taskType: string;
  trustMode: string;
  tier: string | null;
  region: string | null;
  status: AutoRouteDecision['status'];
  code: string | null;
  reason: string | null;
  modelKey: string | null;
  provider: string | null;
  routeId: string | null;
  slotId: string | null;
  cohort: RoutingCohort | null;
  lifecycleStage: string | null;
  fallbacks: RoutingTraceRoute[];
  shadow: (RoutingTraceRoute & { slotId: string }) | null;
  reasons: string[];
  stages: {
    observedHealth: boolean;
    canary: boolean;
    shadow: boolean;
    taskFamily: boolean;
  };
  inputs: {
    capabilitiesInUse: string[];
    observedRouteCount: number;
    unhonouredRouteCount: number;
    unfundedRouteCount: number;
    policyExcludedRouteCount: number;
    preferredRouteId: string | null;
    currentModelKey: string | null;
    budgetConstrained: boolean;
    workspaceModelPolicy: boolean;
    zeroDataRetentionOnly: boolean;
    usOnly: boolean;
    excludedProviderCount: number;
    excludedRouteHostCount: number;
    canaryCohorts: Record<string, boolean>;
  };
  observed: {
    failureRate: number | null;
    latencyP50Ms: number | null;
  };
}

const MAX_TRACE_REASONS = 20;
const MAX_TRACE_REASON_LENGTH = 300;

interface TraceSlotPolicy {
  modelKey: string;
  canary?: { modelKey: string };
}

interface TraceRegistryView {
  models: Record<string, { lifecycle: { stage?: string } }>;
  policies: RoutingRegistryView['policies'];
}

function traceRegistry(): TraceRegistryView {
  return modelRegistry as unknown as TraceRegistryView;
}

function slotIdForDecision(
  decision: AutoRouteDecision,
  request: AutoRoutingRequest,
): string | null {
  if (decision.status !== 'selected') return null;
  const recordedSlot = decision.taskFamilyDecision?.selected?.slotId;
  if (recordedSlot) return recordedSlot;
  const policy = traceRegistry().policies.auto;
  const slots = policy.slots as Record<string, TraceSlotPolicy>;
  const matches = (slotId: string): boolean => {
    const slot = slots[slotId];
    if (!slot) return false;
    return decision.reason === 'canary'
      ? slot.canary?.modelKey === decision.modelKey
      : slot.modelKey === decision.modelKey;
  };
  const task = policy.tasks[request.taskType];
  const profile = decision.effectiveProfile;
  const preferred = profile ? (task?.preferredSlots[profile] ?? []) : [];
  const ordered = [...preferred, policy.fallbackSlot, ...Object.keys(slots).sort()];
  return ordered.find(matches) ?? null;
}

function boundedReasons(reasons: readonly string[]): string[] {
  return reasons
    .slice(0, MAX_TRACE_REASONS)
    .map((reason) => reason.slice(0, MAX_TRACE_REASON_LENGTH));
}

export function buildRoutingDecisionTrace(
  request: AutoRoutingRequest,
  decision: AutoRouteDecision,
): RoutingDecisionTrace {
  const observedEntries = Object.entries(request.observedRouteHealth ?? {});
  const selected = decision.status === 'selected' ? decision : null;
  const selectedObservation = selected
    ? request.observedRouteHealth?.[selected.routeId]
    : undefined;
  const slotId = slotIdForDecision(decision, request);
  const canaryEnabled = request.enableCanary ?? canaryRoutingEnabled();
  return {
    schemaVersion: ROUTING_TRACE_SCHEMA_VERSION,
    requestId: request.requestId ?? null,
    selection: decision.requestedSelection,
    taskType: request.taskType,
    trustMode: request.trustMode,
    tier: request.subscriptionTier ?? null,
    region: request.region ?? null,
    status: decision.status,
    code: decision.status === 'unavailable' ? decision.code : null,
    reason: selected?.reason ?? null,
    modelKey: selected?.modelKey ?? null,
    provider: selected?.provider ?? null,
    routeId: selected?.routeId ?? null,
    slotId,
    cohort: selected && slotId ? (selected.reason === 'canary' ? 'canary' : 'control') : null,
    lifecycleStage: selected
      ? (traceRegistry().models[selected.modelKey]?.lifecycle.stage ?? null)
      : null,
    fallbacks: (selected?.fallbacks ?? []).map((fallback) => ({
      modelKey: fallback.modelKey,
      routeId: fallback.routeId,
    })),
    shadow: selected?.shadow
      ? {
          slotId: selected.shadow.slotId,
          modelKey: selected.shadow.modelKey,
          routeId: selected.shadow.routeId,
        }
      : null,
    reasons: boundedReasons(decision.status === 'unavailable' ? decision.reasons : []),
    stages: {
      observedHealth: request.enableObservedHealthRanking ?? observedHealthRankingEnabled(),
      canary: canaryEnabled,
      shadow: request.enableShadow ?? request.enableCanary ?? shadowMirroringEnabled(),
      taskFamily: request.enableTaskFamilyStage ?? taskFamilyRoutingStageEnabled(),
    },
    inputs: {
      capabilitiesInUse: [...(request.capabilitiesInUse ?? [])],
      observedRouteCount: observedEntries.length,
      unhonouredRouteCount: observedEntries.filter(
        ([, observed]) => (observed.unhonouredCapabilities?.length ?? 0) > 0,
      ).length,
      unfundedRouteCount: observedEntries.filter(([, observed]) => observed.credentialUnfunded)
        .length,
      policyExcludedRouteCount: observedEntries.filter(([, observed]) => observed.policyExcluded)
        .length,
      preferredRouteId: request.preferredRouteId ?? null,
      currentModelKey: request.currentModelKey ?? null,
      budgetConstrained: request.budgetRemainingCents !== undefined,
      workspaceModelPolicy: Boolean(request.organizationPolicy),
      zeroDataRetentionOnly: request.zeroDataRetentionOnly === true,
      usOnly: request.usOnly === true,
      excludedProviderCount: request.excludedProviders?.size ?? 0,
      excludedRouteHostCount: request.excludedRouteHosts?.size ?? 0,
      canaryCohorts: { ...(request.canaryCohorts ?? {}) },
    },
    observed: {
      failureRate: selectedObservation?.failureRate ?? null,
      latencyP50Ms: selectedObservation?.latencyP50Ms ?? null,
    },
  };
}
