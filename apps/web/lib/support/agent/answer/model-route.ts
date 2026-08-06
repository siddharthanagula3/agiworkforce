import 'server-only';

/**
 * The support agent's one bounded model call.
 *
 * Reuses the product's existing model access verbatim — the same primitives
 * `lib/services/scheduled-agent-executor.ts` calls, in the same order. No second
 * provider integration, no HTTP round trip through the LLM route, no model id
 * literal from anywhere: the id comes from `resolveAutoRoute`.
 *
 * One call. No tool loop, no streaming, `maxOutputTokens` capped. A support turn
 * is bounded by construction.
 *
 * COST NOTE (real, unresolved): the marketing widget serves signed-out visitors,
 * so there is no user id and therefore no managed-usage reservation the way the
 * scheduled executor has one. Every anonymous question that clears the relevance
 * floor is an unmetered managed-provider call. Mitigations that live here: a
 * hard output cap, a single non-streaming call, and `SUPPORT_AGENT_ENABLED`
 * defaulting OFF. Rate limiting is the caller's responsibility (the route layer)
 * and is NOT implemented in this module.
 */

import { openAIWireRequestToChatRequest } from '@agiworkforce/provider-protocol';
import { resolveAutoRoute } from '@agiworkforce/routing';
import { drainToLlmResponse } from '@/app/api/llm/v1/chat/completions/lib/adapter-response';
import {
  buildServerProviderAdapter,
  toGenericUpstreamError,
} from '@/lib/services/provider-adapter-service';
import { assertNoLeaks } from '@/lib/leak-detector';
import { logger } from '@/lib/logger';
import { getOptionalEnv } from '@/shared/utils/env';
import { buildSupportSystemPrompt } from '../prompt/system-prompt';

const MAX_OUTPUT_TOKENS = 800;

export type SupportModelResult =
  | { status: 'ok'; text: string; route: { provider: string; modelKey: string } }
  | {
      status: 'unavailable';
      reason: 'disabled' | 'no_route' | 'provider_error' | 'empty_response' | 'prompt_rejected';
      route: { provider: string; modelKey: string } | null;
    };

/**
 * Kill switch. NEW ENV VAR — it does not exist in any deployment today and must
 * be added to the deploy environment before the agent can answer anything.
 * Default OFF so an unconfigured deploy degrades to an abstention plus a human
 * handoff rather than burning provider spend.
 */
export function isSupportAgentEnabled(): boolean {
  const raw = getOptionalEnv('SUPPORT_AGENT_ENABLED');
  if (raw === undefined) return false;
  return ['1', 'true', 'on', 'yes'].includes(raw.trim().toLowerCase());
}

export interface SupportModelCallInput {
  userMessage: string;
  planTier: string | null;
  signal?: AbortSignal;
}

export async function callSupportModel(input: SupportModelCallInput): Promise<SupportModelResult> {
  if (!isSupportAgentEnabled()) {
    return { status: 'unavailable', reason: 'disabled', route: null };
  }

  const route = resolveAutoRoute({
    selection: 'auto',
    taskType: 'simple_chat',
    subscriptionTier: input.planTier ?? 'free',
    trustMode: 'managed_cloud',
    runtimeProfileId: 'web/cloud-chat',
  });
  if (route.status === 'unavailable') {
    logger.warn({ code: route.code }, '[support-agent] no managed route available');
    return { status: 'unavailable', reason: 'no_route', route: null };
  }

  const routeInfo = { provider: route.provider, modelKey: route.modelKey };
  const system = buildSupportSystemPrompt();

  // Last line of defence before anything leaves the process: the rendered prompt
  // must not carry secret-shaped material. A hit fails the turn closed.
  try {
    assertNoLeaks('support-agent-prompt', { system, user: input.userMessage });
  } catch {
    logger.error('[support-agent] prompt rejected by leak detector');
    return { status: 'unavailable', reason: 'prompt_rejected', route: routeInfo };
  }

  const chatRequest = openAIWireRequestToChatRequest({
    model: route.providerModelId,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: input.userMessage },
    ],
    max_tokens: MAX_OUTPUT_TOKENS,
    temperature: 0,
    stream: false,
  });

  const wireMode =
    route.provider === 'anthropic' || route.provider === 'google'
      ? 'legacy-web'
      : 'openai-passthrough';

  try {
    const response = await drainToLlmResponse(
      adapterStream(route.provider, chatRequest, input.signal),
      route.modelKey,
      (chunk) => toGenericUpstreamError(route.provider, chunk),
      wireMode,
    );
    const text = response.content.trim();
    if (!text) return { status: 'unavailable', reason: 'empty_response', route: routeInfo };
    return { status: 'ok', text, route: routeInfo };
  } catch (error) {
    logger.error(
      {
        provider: route.provider,
        error: error instanceof Error ? error.message : String(error),
      },
      '[support-agent] provider call failed',
    );
    return { status: 'unavailable', reason: 'provider_error', route: routeInfo };
  }
}

function adapterStream(
  provider: string,
  chatRequest: ReturnType<typeof openAIWireRequestToChatRequest>,
  signal: AbortSignal | undefined,
): ReturnType<ReturnType<typeof buildServerProviderAdapter>['stream']> {
  const adapter = buildServerProviderAdapter(provider);
  return adapter.stream(chatRequest, signal ?? new AbortController().signal);
}
