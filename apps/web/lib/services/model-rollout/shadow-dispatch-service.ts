import 'server-only';

import { after } from 'next/server';
import { modelRegistry } from '@agiworkforce/model-registry';
import { openAIWireRequestToChatRequest } from '@agiworkforce/provider-protocol';
import type { RouteOutcomeClass, RoutingDecisionTrace, ShadowMirror } from '@agiworkforce/routing';
import { microusdFromCents } from '@agiworkforce/types';

import { resolveWireMode } from '@/app/api/llm/v1/chat/completions/lib/adapter-providers';
import { drainToLlmResponse } from '@/app/api/llm/v1/chat/completions/lib/adapter-response';
import { logger } from '@/lib/logger';
import { getKeyValueStore } from '@/lib/server/key-value';
import { recordProviderCostEvent } from '@/lib/services/cogs-ledger-service';
import { recordShadowRouteOutcome } from '@/lib/services/free-lane/runtime-state-service';
import { LLMCostCalculator } from '@/lib/services/llm-cost-calculator';
import {
  buildServerProviderAdapter,
  toGenericUpstreamError,
} from '@/lib/services/provider-adapter-service';

import { completeRoutingDecision, recordRoutingDecision } from './routing-decision-trace-service';

const SHADOW_COUNTER_PREFIX = 'agi-rollout:shadow-requests';
const SHADOW_COUNTER_TTL_SECONDS = 2 * 24 * 60 * 60;
const SHADOW_TIMEOUT_MS = 120_000;
const SHADOW_TRACE_REASON = 'shadow';
const SHADOW_COST_SOURCE_PREFIX = 'routing_shadow';
const SHADOW_COST_CAPABILITY = 'chat';
const SHADOW_WORKLOAD = 'chat';
const MIRRORED_ROLES = new Set(['system', 'user', 'assistant']);
const CAP_REACHED = Number.MAX_SAFE_INTEGER;

interface ShadowSlotPolicy {
  shadow?: { modelKey: string; dailyRequestCap: number };
}

const SHADOW_SLOT_IDS: readonly string[] = Object.entries(
  modelRegistry.policies.auto.slots as Record<string, ShadowSlotPolicy>,
)
  .filter(([, slot]) => slot.shadow !== undefined)
  .map(([slotId]) => slotId);

function dayStamp(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

function counterKey(slotId: string, nowMs: number): string {
  return `${SHADOW_COUNTER_PREFIX}:${slotId}:${dayStamp(nowMs)}`;
}

/**
 * What each shadow-declaring slot has mirrored today. A counter that cannot be
 * read reads as the cap: the cap bounds spend, and spend nobody can count is
 * spend nobody can bound.
 */
export async function readShadowRequestsToday(
  nowMs: number = Date.now(),
): Promise<Record<string, number>> {
  if (SHADOW_SLOT_IDS.length === 0) return {};
  const saturated = Object.fromEntries(SHADOW_SLOT_IDS.map((slotId) => [slotId, CAP_REACHED]));
  const store = getKeyValueStore();
  if (!store) return saturated;
  try {
    const counts = await Promise.all(
      SHADOW_SLOT_IDS.map((slotId) => store.get<number>(counterKey(slotId, nowMs))),
    );
    return Object.fromEntries(
      SHADOW_SLOT_IDS.map((slotId, index) => [slotId, Number(counts[index] ?? 0)]),
    );
  } catch (error) {
    logger.warn({ error }, '[shadow] daily counters unreadable; mirroring is paused');
    return saturated;
  }
}

async function claimShadowSlot(shadow: ShadowMirror, nowMs: number): Promise<boolean> {
  const store = getKeyValueStore();
  if (!store) return false;
  const key = counterKey(shadow.slotId, nowMs);
  const claimed = await store.increment(key);
  await store.expire(key, SHADOW_COUNTER_TTL_SECONDS);
  return claimed <= shadow.dailyRequestCap;
}

export interface ShadowMessage {
  role: string;
  content: unknown;
}

export interface ShadowDispatchInput {
  shadow: ShadowMirror;
  servedTrace: RoutingDecisionTrace;
  requestId: string;
  userId: string;
  organizationId: string | null;
  surface: string;
  messages: readonly ShadowMessage[];
  maxTokens: number;
  flagVariants: Readonly<Record<string, string>>;
}

type ShadowStage = { lifecycle?: { stage?: string } };

function shadowTrace(input: ShadowDispatchInput): RoutingDecisionTrace {
  const models = modelRegistry.models as unknown as Record<string, ShadowStage | undefined>;
  const model = models[input.shadow.modelKey];
  return {
    ...input.servedTrace,
    reason: SHADOW_TRACE_REASON,
    modelKey: input.shadow.modelKey,
    provider: input.shadow.provider,
    routeId: input.shadow.routeId,
    slotId: input.shadow.slotId,
    cohort: null,
    lifecycleStage: model?.lifecycle?.stage ?? null,
    fallbacks: [],
    shadow: null,
  };
}

function mirroredMessages(messages: readonly ShadowMessage[]) {
  return messages
    .filter((message) => MIRRORED_ROLES.has(message.role) && typeof message.content === 'string')
    .map((message) => ({
      role: message.role as 'system' | 'user' | 'assistant',
      content: message.content as string,
    }));
}

function failureClass(error: unknown): RouteOutcomeClass {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
    ? 'timeout'
    : 'server_error';
}

export async function dispatchShadowRequest(
  input: ShadowDispatchInput,
  nowMs: number = Date.now(),
): Promise<'dispatched' | 'capped' | 'failed'> {
  const { shadow } = input;
  if (!(await claimShadowSlot(shadow, nowMs))) return 'capped';

  await recordRoutingDecision({
    trace: shadowTrace(input),
    requestId: input.requestId,
    userId: input.userId,
    organizationId: input.organizationId,
    surface: input.surface,
    kind: 'shadow',
    flagVariants: input.flagVariants,
  });

  const startedAtMs = Date.now();
  try {
    const response = await drainToLlmResponse(
      buildServerProviderAdapter(shadow.provider).stream(
        openAIWireRequestToChatRequest({
          model: shadow.providerModelId,
          messages: mirroredMessages(input.messages),
          max_tokens: input.maxTokens,
          stream: false,
        }),
        AbortSignal.timeout(SHADOW_TIMEOUT_MS),
      ),
      shadow.modelKey,
      (chunk) => toGenericUpstreamError(shadow.provider, chunk),
      resolveWireMode(shadow.provider),
    );
    const durationMs = Date.now() - startedAtMs;
    const providerCostCents = LLMCostCalculator.calculateCost(
      shadow.provider,
      shadow.modelKey,
      {
        promptTokens: response.promptTokens,
        completionTokens: response.completionTokens,
        totalTokens: response.totalTokens,
        cacheReadInputTokens: response.cachedInputTokens,
        cacheCreationInputTokens: response.cacheCreationInputTokens,
        cacheCreation1hInputTokens: response.cacheCreation1hInputTokens,
      },
      new Date(),
      shadow.routeId,
    );
    await recordProviderCostEvent({
      userId: input.userId,
      organizationId: input.organizationId,
      capability: SHADOW_COST_CAPABILITY,
      provider: shadow.provider,
      model: shadow.modelKey,
      unitBasis: 'token',
      units: response.totalTokens,
      providerCostCents,
      billedCents: 0,
      sourceRef: `${SHADOW_COST_SOURCE_PREFIX}:${input.requestId}`,
      routeId: shadow.routeId,
      surface: input.surface,
      workload: SHADOW_WORKLOAD,
      inputTokens: response.promptTokens,
      outputTokens: response.completionTokens,
      metadata: { kind: SHADOW_TRACE_REASON, slotId: shadow.slotId },
    });
    await Promise.all([
      recordShadowRouteOutcome(shadow.routeId, {
        class: 'success',
        durationMs,
        outputTokens: response.completionTokens,
      }),
      completeRoutingDecision({
        requestId: input.requestId,
        kind: 'shadow',
        outcome: 'succeeded',
        durationMs,
        providerCostMicrousd: microusdFromCents(providerCostCents),
      }),
    ]);
    return 'dispatched';
  } catch (error) {
    const durationMs = Date.now() - startedAtMs;
    logger.warn(
      { error, requestId: input.requestId, routeId: shadow.routeId },
      '[shadow] mirrored request failed',
    );
    await Promise.allSettled([
      recordShadowRouteOutcome(shadow.routeId, { class: failureClass(error) }),
      completeRoutingDecision({
        requestId: input.requestId,
        kind: 'shadow',
        outcome: 'failed',
        errorCode: error instanceof Error ? error.name : 'unknown',
        durationMs,
      }),
    ]);
    return 'failed';
  }
}

/**
 * Runs after the served response, never inside it: the mirrored answer is
 * discarded, so nothing about it may cost the user latency or an error.
 */
export function scheduleShadowDispatch(input: ShadowDispatchInput): void {
  const task = dispatchShadowRequest(input)
    .then(() => undefined)
    .catch((error: unknown) => {
      logger.warn({ error, requestId: input.requestId }, '[shadow] dispatch was not scheduled');
    });
  try {
    after(task);
  } catch {
    void task;
  }
}
