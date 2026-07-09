/**
 * OpenRouter → Anthropic cache_control passthrough.
 *
 * For Anthropic-routed models (`modelId` starting with `anthropic/`),
 * OpenRouter forwards an Anthropic `cache_control` block placed on a message
 * straight through to the upstream Anthropic API (confirmed in
 * `apps/web/lib/llm-providers/openrouter.ts`'s `mapMessages`, the source of
 * truth for this port, which injects it on the system message only — never
 * on the last-user or a tool_result message).
 *
 * This module ports the OBSERVABLE DEFAULT: the web adapter's
 * `resolveCacheRetention` resolves `'short'` (5-minute ephemeral) for
 * `anthropic-direct` and `openrouter` + `anthropic/*` routes whenever the
 * caller hasn't set an explicit retention. It does NOT port the full
 * session-stability / extraParams-precedence policy engine from
 * `apps/web/lib/llm-providers/cache-retention.ts` — that logic legitimately
 * depends on session/user state the adapter layer doesn't have (the same
 * reason deepseek/xai/perplexity don't embed routing or retry policy).
 * Callers that need finer control pass `anthropicCacheRetention` on the
 * adapter config; `'none'` disables the block entirely.
 */

import type {
  OpenAIChatCompletionCreateParams,
  OpenAIChatMessageParam,
} from '@agiworkforce/providers-openai';

export type OpenRouterAnthropicCacheRetention = 'none' | 'short' | 'long';

interface AnthropicCacheControl {
  type: 'ephemeral';
  ttl?: '5m' | '1h';
}

function buildCacheControl(
  retention: OpenRouterAnthropicCacheRetention,
): AnthropicCacheControl | null {
  if (retention === 'none') return null;
  return retention === 'long' ? { type: 'ephemeral', ttl: '1h' } : { type: 'ephemeral' };
}

/** `translateChatRequest` always emits a `string` system/developer content. */
function isSystemLikeMessage(
  msg: OpenAIChatMessageParam,
): msg is Extract<OpenAIChatMessageParam, { role: 'system' | 'developer' }> {
  return msg.role === 'system' || msg.role === 'developer';
}

/**
 * Mutate `params` in place: when `params.model` is an `anthropic/*`
 * OpenRouter route, wrap the system message's string content in an
 * Anthropic-shape `cache_control` block. No-op for every other route, for a
 * `'none'` retention, or when there is no system message to attach to.
 */
export function applyOpenRouterAnthropicCacheControl(
  params: OpenAIChatCompletionCreateParams,
  retention: OpenRouterAnthropicCacheRetention,
): void {
  if (!params.model.startsWith('anthropic/')) return;
  const cacheControl = buildCacheControl(retention);
  if (!cacheControl) return;

  const systemMessage = params.messages.find(isSystemLikeMessage);
  if (!systemMessage || systemMessage.content.length === 0) return;

  // Cast at the boundary: the OpenAI SDK's declared message-param shape is
  // `content: string`, but OpenRouter accepts (and forwards to Anthropic) an
  // Anthropic-shape content-block array carrying `cache_control` — the same
  // escape hatch `applyOpenAIResponsesPayloadPolicy` uses for vendor-specific
  // fields the hand-typed `OpenAIChatCompletionCreateParams` doesn't model.
  (systemMessage as unknown as { content: unknown }).content = [
    { type: 'text', text: systemMessage.content, cache_control: cacheControl },
  ];
}
