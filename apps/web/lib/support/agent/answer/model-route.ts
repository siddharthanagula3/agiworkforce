import 'server-only';

import { openAIWireRequestToChatRequest } from '@agiworkforce/provider-protocol';
import { resolveAutoRoute } from '@agiworkforce/routing';
import { resolveWireMode } from '@/app/api/llm/v1/chat/completions/lib/adapter-providers';
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

  const wireMode = resolveWireMode(route.provider);

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
