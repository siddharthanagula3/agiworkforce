import 'server-only';

import { estimateTokens } from '@agiworkforce/routing';

export interface ProviderProxyUsage {
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cacheWrite1hTokens: number;
}

export interface ProviderProxyStreamUsageAccumulator {
  push(chunkText: string): void;
  finish(): ProviderProxyUsage | null;
  /** The generated text, reasoning and tool arguments the stream carried to the caller. */
  deliveredText(): string;
}

function stringField(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export interface ProviderProxyUsageParser {
  parseJsonBody(body: unknown): ProviderProxyUsage | null;
  createStreamAccumulator(): ProviderProxyStreamUsageAccumulator;
}

function numericField(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}

interface AnthropicTokenCounts {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cacheWrite1hTokens: number;
}

const ZERO_ANTHROPIC_TOKEN_COUNTS: AnthropicTokenCounts = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  cacheWrite1hTokens: 0,
};

function extractAnthropicUsage(usage: unknown): AnthropicTokenCounts | null {
  const usageRecord = record(usage);
  if (!usageRecord) return null;
  const cacheCreation = record(usageRecord['cache_creation']);
  return {
    inputTokens: numericField(usageRecord['input_tokens']),
    outputTokens: numericField(usageRecord['output_tokens']),
    cacheReadTokens: numericField(usageRecord['cache_read_input_tokens']),
    cacheWriteTokens: numericField(usageRecord['cache_creation_input_tokens']),
    cacheWrite1hTokens: numericField(cacheCreation?.['ephemeral_1h_input_tokens']),
  };
}

const SSE_EVENT_SEPARATOR = '\n\n';

function createAnthropicStreamAccumulator(): ProviderProxyStreamUsageAccumulator {
  let buffer = '';
  let model: string | null = null;
  let counts: AnthropicTokenCounts | null = null;
  let delivered = '';

  function applyEvent(event: Record<string, unknown>): void {
    if (event['type'] === 'content_block_delta') {
      const delta = record(event['delta']);
      delivered +=
        stringField(delta?.['text']) +
        stringField(delta?.['thinking']) +
        stringField(delta?.['partial_json']);
      return;
    }
    if (event['type'] === 'message_start') {
      const message = record(event['message']);
      if (!message) return;
      if (typeof message['model'] === 'string') model = message['model'];
      const parsed = extractAnthropicUsage(message['usage']);
      if (parsed) counts = { ...(counts ?? ZERO_ANTHROPIC_TOKEN_COUNTS), ...parsed };
      return;
    }
    if (event['type'] === 'message_delta') {
      const parsed = extractAnthropicUsage(event['usage']);
      if (parsed) {
        counts = {
          ...(counts ?? ZERO_ANTHROPIC_TOKEN_COUNTS),
          outputTokens: parsed.outputTokens,
        };
      }
    }
  }

  function consumeFrame(frame: string): void {
    const dataLines = frame
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice('data:'.length).trim())
      .filter((line) => line.length > 0);
    if (dataLines.length === 0) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(dataLines.join(''));
    } catch {
      return;
    }
    const event = record(parsed);
    if (event) applyEvent(event);
  }

  return {
    push(chunkText: string): void {
      buffer += chunkText.replace(/\r\n/g, '\n');
      let boundary = buffer.indexOf(SSE_EVENT_SEPARATOR);
      while (boundary !== -1) {
        consumeFrame(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + SSE_EVENT_SEPARATOR.length);
        boundary = buffer.indexOf(SSE_EVENT_SEPARATOR);
      }
    },
    finish(): ProviderProxyUsage | null {
      if (buffer.trim().length > 0) consumeFrame(buffer);
      buffer = '';
      if (!counts) return null;
      return { model, ...counts };
    },
    deliveredText(): string {
      return delivered;
    },
  };
}

const anthropicProviderProxyUsageParser: ProviderProxyUsageParser = {
  parseJsonBody(body: unknown): ProviderProxyUsage | null {
    const bodyRecord = record(body);
    if (!bodyRecord) return null;
    const counts = extractAnthropicUsage(bodyRecord['usage']);
    if (!counts) return null;
    const model = typeof bodyRecord['model'] === 'string' ? bodyRecord['model'] : null;
    return { model, ...counts };
  },
  createStreamAccumulator: createAnthropicStreamAccumulator,
};

interface OpenAITokenCounts {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cacheWrite1hTokens: number;
}

/**
 * OpenAI's Responses API (`input_tokens`/`output_tokens`, verified against
 * this repo's own `packages/ai/providers/openai/src/responses-types.ts` and
 * `stream-responses.ts`) and its Chat Completions API
 * (`prompt_tokens`/`completion_tokens`, `packages/ai/providers/openai/src/types.ts`
 * and `stream.ts`) are distinguished by which token-count keys their `usage`
 * object carries; codex only ever sends Responses-API traffic through this
 * proxy, but the parser accepts both since nothing else about this route is
 * Responses-specific.
 */
function extractOpenAIResponsesUsage(usage: unknown): OpenAITokenCounts | null {
  const usageRecord = record(usage);
  if (!usageRecord) return null;
  const details = record(usageRecord['input_tokens_details']);
  return {
    inputTokens: numericField(usageRecord['input_tokens']),
    outputTokens: numericField(usageRecord['output_tokens']),
    cacheReadTokens: numericField(details?.['cached_tokens']),
    cacheWriteTokens: numericField(details?.['cache_write_tokens']),
    cacheWrite1hTokens: 0,
  };
}

function extractOpenAIChatCompletionsUsage(usage: unknown): OpenAITokenCounts | null {
  const usageRecord = record(usage);
  if (!usageRecord) return null;
  const details = record(usageRecord['prompt_tokens_details']);
  return {
    inputTokens: numericField(usageRecord['prompt_tokens']),
    outputTokens: numericField(usageRecord['completion_tokens']),
    cacheReadTokens: numericField(details?.['cached_tokens']),
    cacheWriteTokens: numericField(details?.['cache_write_tokens']),
    cacheWrite1hTokens: 0,
  };
}

function extractOpenAIUsage(usage: unknown): OpenAITokenCounts | null {
  const usageRecord = record(usage);
  if (!usageRecord) return null;
  if ('input_tokens' in usageRecord || 'output_tokens' in usageRecord) {
    return extractOpenAIResponsesUsage(usageRecord);
  }
  if ('prompt_tokens' in usageRecord || 'completion_tokens' in usageRecord) {
    return extractOpenAIChatCompletionsUsage(usageRecord);
  }
  return null;
}

const OPENAI_RESPONSES_TEXT_DELTA_EVENTS: ReadonlySet<string> = new Set([
  'response.output_text.delta',
  'response.refusal.delta',
  'response.function_call_arguments.delta',
  'response.custom_tool_call_input.delta',
  'response.reasoning_text.delta',
  'response.reasoning_summary_text.delta',
]);

function createOpenAIStreamAccumulator(): ProviderProxyStreamUsageAccumulator {
  let buffer = '';
  let model: string | null = null;
  let counts: OpenAITokenCounts | null = null;
  let delivered = '';

  function applyResponsesEvent(event: Record<string, unknown>): void {
    const eventType = event['type'];
    if (eventType === 'response.created' || eventType === 'response.in_progress') {
      const response = record(event['response']);
      if (typeof response?.['model'] === 'string') model = response['model'];
      return;
    }
    // A response cut short by its own output limit has still been generated,
    // delivered and charged by the provider, so its usage settles like a
    // completed one.
    if (eventType === 'response.completed' || eventType === 'response.incomplete') {
      const response = record(event['response']);
      if (typeof response?.['model'] === 'string') model = response['model'];
      const parsed = extractOpenAIResponsesUsage(response?.['usage']);
      if (parsed) counts = parsed;
      return;
    }
    if (typeof eventType === 'string' && OPENAI_RESPONSES_TEXT_DELTA_EVENTS.has(eventType)) {
      delivered += stringField(event['delta']);
    }
  }

  function applyChatCompletionChunk(chunk: Record<string, unknown>): void {
    if (typeof chunk['model'] === 'string') model = chunk['model'];
    const parsed = extractOpenAIChatCompletionsUsage(chunk['usage']);
    if (parsed) counts = parsed;
    const choices = Array.isArray(chunk['choices']) ? chunk['choices'] : [];
    for (const choice of choices) {
      const delta = record(record(choice)?.['delta']);
      delivered += stringField(delta?.['content']);
      const toolCalls = Array.isArray(delta?.['tool_calls']) ? delta['tool_calls'] : [];
      for (const call of toolCalls) {
        delivered += stringField(record(record(call)?.['function'])?.['arguments']);
      }
    }
  }

  function consumeFrame(frame: string): void {
    const dataLines = frame
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice('data:'.length).trim())
      .filter((line) => line.length > 0);
    if (dataLines.length === 0) return;
    const payload = dataLines.join('');
    if (payload === '[DONE]') return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      return;
    }
    const event = record(parsed);
    if (!event) return;
    if (typeof event['type'] === 'string') applyResponsesEvent(event);
    else applyChatCompletionChunk(event);
  }

  return {
    push(chunkText: string): void {
      buffer += chunkText.replace(/\r\n/g, '\n');
      let boundary = buffer.indexOf(SSE_EVENT_SEPARATOR);
      while (boundary !== -1) {
        consumeFrame(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + SSE_EVENT_SEPARATOR.length);
        boundary = buffer.indexOf(SSE_EVENT_SEPARATOR);
      }
    },
    finish(): ProviderProxyUsage | null {
      if (buffer.trim().length > 0) consumeFrame(buffer);
      buffer = '';
      if (!counts) return null;
      return { model, ...counts };
    },
    deliveredText(): string {
      return delivered;
    },
  };
}

const openaiProviderProxyUsageParser: ProviderProxyUsageParser = {
  parseJsonBody(body: unknown): ProviderProxyUsage | null {
    const bodyRecord = record(body);
    if (!bodyRecord) return null;
    const counts = extractOpenAIUsage(bodyRecord['usage']);
    if (!counts) return null;
    const model = typeof bodyRecord['model'] === 'string' ? bodyRecord['model'] : null;
    return { model, ...counts };
  },
  createStreamAccumulator: createOpenAIStreamAccumulator,
};

const PROVIDER_PROXY_USAGE_PARSERS: Readonly<Record<string, ProviderProxyUsageParser>> =
  Object.freeze({
    anthropic: anthropicProviderProxyUsageParser,
    openai: openaiProviderProxyUsageParser,
  });

export function getProviderProxyUsageParser(providerId: string): ProviderProxyUsageParser | null {
  return PROVIDER_PROXY_USAGE_PARSERS[providerId] ?? null;
}

/**
 * Providers report the output count only as a stream ends, so a caller that
 * disconnects mid-answer leaves it at zero after the provider has billed the
 * prompt and the output so far. The prompt estimate the reservation was sized on
 * and the output that reached the caller stand in for counts the provider did
 * not report; a call that delivered nothing keeps what was observed.
 */
export function stoppedProviderProxyUsage(
  metering: { estimatedPromptTokens: number; reservedModel: string },
  usage: ProviderProxyUsage | null,
  deliveredText: string,
): ProviderProxyUsage | null {
  if ((usage?.outputTokens ?? 0) > 0 || !deliveredText.trim()) return usage;
  return {
    model: usage?.model ?? null,
    inputTokens:
      usage && usage.inputTokens > 0 ? usage.inputTokens : metering.estimatedPromptTokens,
    outputTokens: estimateTokens(deliveredText, usage?.model ?? metering.reservedModel),
    cacheReadTokens: usage?.cacheReadTokens ?? 0,
    cacheWriteTokens: usage?.cacheWriteTokens ?? 0,
    cacheWrite1hTokens: usage?.cacheWrite1hTokens ?? 0,
  };
}
