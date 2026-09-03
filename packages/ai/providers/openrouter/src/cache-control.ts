import type { ChatRequest, TextBlock } from '@agiworkforce/types';
import { splitSystemPromptCacheBoundary } from '@agiworkforce/provider-protocol';
import type {
  OpenAIChatCompletionCreateParams,
  OpenAIChatMessageParam,
} from '@agiworkforce/providers-openai';

export type OpenRouterAnthropicCacheRetention = 'none' | 'short' | 'long';

interface AnthropicCacheControl {
  type: 'ephemeral';
  ttl?: '5m' | '1h';
}

interface AnthropicCacheableTextBlock {
  type: 'text';
  text: string;
  cache_control?: AnthropicCacheControl;
}

const OPENROUTER_CACHE_CONTROL_ROUTE_PREFIXES = ['anthropic/', 'google/'] as const;

function supportsCacheControlPassthrough(model: string): boolean {
  return OPENROUTER_CACHE_CONTROL_ROUTE_PREFIXES.some((prefix) => model.startsWith(prefix));
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

function joinTextBlocks(blocks: TextBlock[]): string {
  return blocks.map((b) => b.text).join('\n\n');
}

function joinLeadingSystemMessages(messages: ChatRequest['messages']): string {
  const parts: string[] = [];
  for (const message of messages) {
    if (message.role !== 'system') break;
    parts.push(
      typeof message.content === 'string'
        ? message.content
        : joinTextBlocks(message.content.filter((b): b is TextBlock => b.type === 'text')),
    );
  }
  return parts.join('\n\n');
}

function resolveRequestSystemText(req: ChatRequest): string {
  if (req.system !== undefined) {
    return typeof req.system === 'string' ? req.system : joinTextBlocks(req.system);
  }
  return joinLeadingSystemMessages(req.messages);
}

export function applyOpenRouterAnthropicCacheControl(
  params: OpenAIChatCompletionCreateParams,
  retention: OpenRouterAnthropicCacheRetention,
  req?: ChatRequest,
): void {
  if (!supportsCacheControlPassthrough(params.model)) return;
  const cacheControl = buildCacheControl(retention);
  if (!cacheControl) return;

  const systemMessage = params.messages.find(isSystemLikeMessage);
  if (!systemMessage || systemMessage.content.length === 0) return;

  const boundarySplit = req
    ? splitSystemPromptCacheBoundary(resolveRequestSystemText(req))
    : undefined;

  if (!boundarySplit) {
    (systemMessage as unknown as { content: unknown }).content = [
      { type: 'text', text: systemMessage.content, cache_control: cacheControl },
    ];
    return;
  }

  const blocks: AnthropicCacheableTextBlock[] = [];
  if (boundarySplit.stablePrefix) {
    blocks.push({ type: 'text', text: boundarySplit.stablePrefix, cache_control: cacheControl });
  }
  if (boundarySplit.dynamicSuffix) {
    blocks.push({ type: 'text', text: boundarySplit.dynamicSuffix });
  }
  (systemMessage as unknown as { content: unknown }).content = blocks;
}
