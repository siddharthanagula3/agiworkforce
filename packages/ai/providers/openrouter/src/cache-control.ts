
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

function isSystemLikeMessage(
  msg: OpenAIChatMessageParam,
): msg is Extract<OpenAIChatMessageParam, { role: 'system' | 'developer' }> {
  return msg.role === 'system' || msg.role === 'developer';
}

export function applyOpenRouterAnthropicCacheControl(
  params: OpenAIChatCompletionCreateParams,
  retention: OpenRouterAnthropicCacheRetention,
): void {
  if (!params.model.startsWith('anthropic/')) return;
  const cacheControl = buildCacheControl(retention);
  if (!cacheControl) return;

  const systemMessage = params.messages.find(isSystemLikeMessage);
  if (!systemMessage || systemMessage.content.length === 0) return;

  (systemMessage as unknown as { content: unknown }).content = [
    { type: 'text', text: systemMessage.content, cache_control: cacheControl },
  ];
}
