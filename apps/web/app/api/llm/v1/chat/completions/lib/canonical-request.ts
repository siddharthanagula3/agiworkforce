import 'server-only';

import {
  openAIWireRequestToChatRequest,
  supportsOpenAIReasoningEffort,
  toProviderApiModelId,
  type OpenAIWireChatRequest,
  type OpenAIWireMessage,
  type OpenAIWireToolCall,
  type OpenAIWireToolChoice,
  type OpenAIWireToolDefinition,
} from '@agiworkforce/provider-protocol';
import { getModelMetadataById, normalizeModelId } from '@agiworkforce/types';
import type { ChatRequest, Effort, ThinkingConfig } from '@agiworkforce/types';
import { openRouterFailoverSlugFor, openRouterSlugFor } from '@/lib/services/aggregator-routing';
import type { ProcessedRequest } from './request-processor';

type InternalMessage = ProcessedRequest['llmRequest']['messages'][number];

function isFunctionToolDef(tool: unknown): tool is OpenAIWireToolDefinition {
  return (
    !!tool &&
    typeof tool === 'object' &&
    (tool as { type?: unknown }).type === 'function' &&
    typeof (tool as { function?: unknown }).function === 'object' &&
    (tool as { function: unknown }).function !== null
  );
}

function toWireMessage(msg: InternalMessage): OpenAIWireMessage {
  const wire: OpenAIWireMessage = {
    role: msg.role,
    content: (msg.multimodal_content as OpenAIWireMessage['content'] | undefined) ?? msg.content,
  };
  if (msg.tool_call_id !== undefined) wire.tool_call_id = msg.tool_call_id;
  if (msg.tool_calls !== undefined) wire.tool_calls = msg.tool_calls as OpenAIWireToolCall[];
  if (msg.__canonicalThinking !== undefined) wire.__canonicalThinking = msg.__canonicalThinking;
  return wire;
}

function splitTools(tools: unknown[] | undefined): {
  functionTools: OpenAIWireToolDefinition[];
  rawVendorTools: unknown[];
} {
  const functionTools: OpenAIWireToolDefinition[] = [];
  const rawVendorTools: unknown[] = [];
  for (const tool of tools ?? []) {
    if (isFunctionToolDef(tool)) functionTools.push(tool);
    else rawVendorTools.push(tool);
  }
  return { functionTools, rawVendorTools };
}

function wireModelId(modelId: string, provider: string | undefined): string {
  const apiModelId = toProviderApiModelId(modelId);
  if (provider !== 'openrouter' && provider !== 'open_router') return apiModelId;
  return openRouterSlugFor(apiModelId) ?? openRouterFailoverSlugFor(apiModelId) ?? apiModelId;
}

export function toCanonicalChatRequest(processed: ProcessedRequest): ChatRequest {
  const { llmRequest } = processed;
  const { functionTools, rawVendorTools } = splitTools(llmRequest.tools);

  const wireRequest: OpenAIWireChatRequest = {
    model: wireModelId(llmRequest.model, processed.provider),
    messages: llmRequest.messages.map(toWireMessage),
    ...(llmRequest.stream !== undefined ? { stream: llmRequest.stream } : {}),
    ...(llmRequest.temperature !== undefined ? { temperature: llmRequest.temperature } : {}),
    ...(llmRequest.max_tokens !== undefined ? { max_tokens: llmRequest.max_tokens } : {}),
    ...(functionTools.length > 0 ? { tools: functionTools } : {}),
    ...(llmRequest.tool_choice !== undefined
      ? { tool_choice: llmRequest.tool_choice as OpenAIWireToolChoice }
      : {}),
  };

  const chatRequest = openAIWireRequestToChatRequest(wireRequest);
  if (rawVendorTools.length > 0) chatRequest.rawVendorTools = rawVendorTools;
  if (processed.zeroDataRetentionOnly) chatRequest.zeroDataRetentionOnly = true;
  return chatRequest;
}

export function toCanonicalThinking(
  provider: string,
  thinking: ProcessedRequest['llmRequest']['thinking'],
): ThinkingConfig | undefined {
  if (provider !== 'anthropic') return undefined;
  if (!thinking) return undefined;
  if (thinking.type === 'adaptive') {
    return { type: 'adaptive' };
  }
  if (thinking.type === 'enabled') {
    return { type: 'enabled', budgetTokens: thinking.budget_tokens };
  }
  return { type: 'disabled' };
}

export function toCanonicalEffort(
  provider: string,
  effort: ProcessedRequest['llmRequest']['effort'],
): Effort | undefined {
  if (provider !== 'anthropic') return undefined;
  return effort as Effort | undefined;
}

export function toCanonicalGoogleThinking(
  provider: string,
  effort: ProcessedRequest['llmRequest']['effort'],
  model?: string,
): ThinkingConfig | undefined {
  if (provider !== 'google') return undefined;
  if (usesGoogleThinkingLevel(model)) {
    const thinkingLevel = GOOGLE_THINKING_LEVEL[effort as 'minimal' | 'low' | 'medium' | 'high'];
    if (thinkingLevel === undefined) return undefined;
    return { type: 'enabled', thinkingLevel, includeThoughts: false };
  }
  const budgetTokens = GOOGLE_THINKING_BUDGET[effort as 'low' | 'medium' | 'high'];
  if (budgetTokens === undefined) return undefined;
  return { type: 'enabled', budgetTokens, includeThoughts: false };
}

function usesGoogleThinkingLevel(model: string | undefined): boolean {
  if (!model) return false;
  return (
    getModelMetadataById(model)?.reasoning?.request?.effortPath === 'thinkingConfig.thinkingLevel'
  );
}

const GOOGLE_THINKING_BUDGET: Readonly<Record<'low' | 'medium' | 'high', number>> = {
  low: 1024,
  medium: 8192,
  high: 24576,
};

const GOOGLE_THINKING_LEVEL: Readonly<
  Record<'minimal' | 'low' | 'medium' | 'high', 'minimal' | 'low' | 'medium' | 'high'>
> = {
  minimal: 'minimal',
  low: 'low',
  medium: 'medium',
  high: 'high',
};

export function buildAnthropicChatRequest(processed: ProcessedRequest): ChatRequest {
  const chatRequest = toCanonicalChatRequest(processed);
  const thinking = toCanonicalThinking(processed.provider, processed.llmRequest.thinking);
  if (thinking !== undefined) chatRequest.thinking = thinking;
  const effort = toCanonicalEffort(processed.provider, processed.llmRequest.effort);
  if (effort !== undefined) chatRequest.effort = effort;
  return chatRequest;
}

export function buildGoogleChatRequest(processed: ProcessedRequest): ChatRequest {
  const chatRequest = toCanonicalChatRequest(processed);
  const thinking = toCanonicalGoogleThinking(
    processed.provider,
    processed.llmRequest.effort,
    processed.llmRequest.model,
  );
  if (thinking !== undefined) chatRequest.thinking = thinking;
  return chatRequest;
}

export function resolveWebOpenAIReasoningEffort(
  provider: string,
  effort: ProcessedRequest['llmRequest']['effort'],
  model: string,
): Effort | undefined {
  if (provider !== 'openai') return undefined;
  const normalized = typeof effort === 'string' ? effort.toLowerCase() : undefined;
  if (!normalized) return undefined;
  const supported = supportsOpenAIReasoningEffort(
    { provider: 'openai', id: normalizeModelId(model) ?? model },
    normalized,
  );
  return supported ? (normalized as Effort) : undefined;
}

export function buildOpenAIChatRequest(processed: ProcessedRequest): ChatRequest {
  const chatRequest = toCanonicalChatRequest(processed);
  const effort = resolveWebOpenAIReasoningEffort(
    processed.provider,
    processed.llmRequest.effort,
    processed.llmRequest.model,
  );
  if (effort !== undefined) chatRequest.effort = effort;
  return chatRequest;
}

export type AnthropicCacheConfig = {
  enableCacheControl: boolean;
  cacheRetention: 'short' | 'long' | 'none';
};

export function computeAnthropicCacheConfig(processed: ProcessedRequest): AnthropicCacheConfig {
  const { llmRequest } = processed;
  if (!llmRequest.usePromptCache) {
    return { enableCacheControl: false, cacheRetention: 'none' };
  }
  const hasTools = llmRequest.tools !== undefined;
  return { enableCacheControl: true, cacheRetention: hasTools ? 'long' : 'short' };
}
