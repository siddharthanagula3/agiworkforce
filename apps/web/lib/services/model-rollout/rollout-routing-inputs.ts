import 'server-only';

import {
  resolveAutoRoute,
  type AutoRouteDecision,
  type AutoRoutingRequest,
  type IntrinsicCapability,
  type ObservedRouteHealth,
} from '@agiworkforce/routing';

import {
  buildFlagSubject,
  evaluateFlagsForSubject,
  type FlagSubjectFacts,
} from '@/lib/feature-flags/flag-evaluation-service';
import { ROUTING_FLAG_PREFIX, routingFlagInputs } from '@/lib/feature-flags/routing-flags';
import { PROMPT_FLAG_PREFIX, promptVariantsFromFlags } from '@/lib/prompts/prompt-flags';
import { logger } from '@/lib/logger';
import { managedCloudDataRegion } from '@/lib/server/data-region';
import {
  getUnhonouredCapabilities,
  STRUCTURED_OUTPUT_CAPABILITY,
  TOOL_CALLING_CAPABILITY,
} from '@/lib/services/free-lane/capability-health-service';

import { readShadowRequestsToday } from './shadow-dispatch-service';

export interface WebCloudRolloutInputs {
  region: string | null;
  requestId: string;
  capabilitiesInUse: readonly IntrinsicCapability[];
  enableObservedHealthRanking?: boolean;
  enableCanary?: boolean;
  enableShadow?: boolean;
  canaryCohorts?: Readonly<Record<string, boolean>>;
  shadowRequestsToday: Readonly<Record<string, number>>;
  flagVariants: Readonly<Record<string, string>>;
  /** Prompt manifest version each prompt serves this subject; absent means pinned. */
  promptVariants: Readonly<Record<string, number>>;
}

export interface CapabilitySignals {
  tools?: readonly unknown[] | undefined;
  tool_choice?: unknown;
  response_format?: { type?: string } | undefined;
}

const NO_TOOL_CHOICE = 'none';
const STRUCTURED_RESPONSE_TYPES = new Set(['json_object', 'json_schema']);

export function capabilitiesInUseForRequest(request: CapabilitySignals): IntrinsicCapability[] {
  const capabilities: IntrinsicCapability[] = [];
  if ((request.tools?.length ?? 0) > 0 && request.tool_choice !== NO_TOOL_CHOICE) {
    capabilities.push(TOOL_CALLING_CAPABILITY);
  }
  if (STRUCTURED_RESPONSE_TYPES.has(request.response_format?.type ?? '')) {
    capabilities.push(STRUCTURED_OUTPUT_CAPABILITY);
  }
  return capabilities;
}

export async function resolveWebCloudRolloutInputs(input: {
  request: Request;
  subject: FlagSubjectFacts;
  requestId: string;
  conversationId?: string | null;
  signals: CapabilitySignals;
  nowMs?: number;
}): Promise<WebCloudRolloutInputs> {
  const nowMs = input.nowMs ?? Date.now();
  const subject = buildFlagSubject(input.request, input.subject);
  const [evaluations, promptEvaluations, shadowRequestsToday] = await Promise.all([
    evaluateFlagsForSubject(subject, { keyPrefix: ROUTING_FLAG_PREFIX }, nowMs),
    evaluateFlagsForSubject(subject, { keyPrefix: PROMPT_FLAG_PREFIX }, nowMs),
    readShadowRequestsToday(nowMs),
  ]);
  return {
    ...routingFlagInputs(evaluations),
    promptVariants: promptVariantsFromFlags(promptEvaluations),
    region: managedCloudDataRegion(),
    requestId: input.conversationId || input.requestId,
    capabilitiesInUse: capabilitiesInUseForRequest(input.signals),
    shadowRequestsToday,
  };
}

function decisionRouteIds(decision: AutoRouteDecision): string[] {
  if (decision.status !== 'selected') return [];
  return [decision.routeId, ...decision.fallbacks.map((fallback) => fallback.routeId)];
}

/**
 * Tool reliability on the serving path. The first pass names the routes this
 * request would use; only when one of them has stopped honouring a capability
 * the request carries does a second pass run with that evidence, so a request
 * with no tools, or a fleet with no recorded loss, costs one store read at most.
 */
export interface ObservedRoutingResolution {
  decision: AutoRouteDecision;
  routingRequest: AutoRoutingRequest;
}

export async function resolveWithObservedCapabilities(
  routingRequest: AutoRoutingRequest,
  nowMs: number = Date.now(),
): Promise<ObservedRoutingResolution> {
  const decision = resolveAutoRoute(routingRequest);
  const unchanged = { decision, routingRequest };
  const capabilitiesInUse = routingRequest.capabilitiesInUse ?? [];
  const routeIds = decisionRouteIds(decision);
  if (capabilitiesInUse.length === 0 || routeIds.length === 0) return unchanged;

  let unhonoured: Readonly<Record<string, readonly IntrinsicCapability[]>>;
  try {
    unhonoured = await getUnhonouredCapabilities(routeIds, capabilitiesInUse, nowMs);
  } catch (error) {
    logger.warn(
      { error, requestId: routingRequest.requestId },
      '[capability-health] read failed; routing on declared capabilities only',
    );
    return unchanged;
  }
  if (Object.keys(unhonoured).length === 0) return unchanged;

  const observedRouteHealth: Record<string, ObservedRouteHealth> = {
    ...routingRequest.observedRouteHealth,
  };
  for (const [routeId, capabilities] of Object.entries(unhonoured)) {
    observedRouteHealth[routeId] = {
      ...observedRouteHealth[routeId],
      unhonouredCapabilities: capabilities,
    };
  }
  const observedRequest = { ...routingRequest, observedRouteHealth };
  return { decision: resolveAutoRoute(observedRequest), routingRequest: observedRequest };
}
