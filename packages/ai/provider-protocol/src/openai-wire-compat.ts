import type {
  ChatRequest,
  ContentBlock,
  ProviderMessage,
  StreamChunk,
  TextBlock,
  ThinkingBlock,
  ToolChoice,
  ToolDef,
  ToolResultBlock,
  ToolUseBlock,
} from '@agiworkforce/types';
import { toolStatusPhrase } from './tool-status-phrases';

export interface OpenAIWireToolCall {
  id: string;
  type?: 'function';
  index?: number;
  function: { name: string; arguments: string };
}

export interface OpenAIWireMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | Array<Record<string, unknown>> | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: OpenAIWireToolCall[];
  __canonicalThinking?: ThinkingBlock[];
}

export interface OpenAIWireToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
    strict?: boolean;
  };
}

export type OpenAIWireToolChoice =
  | 'auto'
  | 'none'
  | 'required'
  | { type: 'function'; function: { name: string } };

export interface OpenAIWireChatRequest {
  model: string;
  messages: OpenAIWireMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  top_p?: number;
  stop?: string | string[];
  tools?: OpenAIWireToolDefinition[];
  tool_choice?: OpenAIWireToolChoice;
  metadata?: Record<string, unknown>;
}

function wireContentToText(content: OpenAIWireMessage['content']): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part['text'] === 'string') return part['text'];
        return '';
      })
      .join('');
  }
  return '';
}

function wireContentToBlocks(content: Array<Record<string, unknown>>): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  for (const part of content) {
    const type = part['type'];
    if (type === 'text' && typeof part['text'] === 'string') {
      blocks.push({ type: 'text', text: part['text'] });
      continue;
    }
    if (type === 'image_url') {
      const imageUrl = part['image_url'] as { url?: string } | undefined;
      const url = imageUrl?.url;
      if (typeof url === 'string' && url.length > 0) {
        const dataUrlMatch = /^data:([^;]+);base64,([\s\S]*)$/.exec(url);
        if (dataUrlMatch && dataUrlMatch[1] && dataUrlMatch[2] !== undefined) {
          blocks.push({
            type: 'image',
            source: { type: 'base64', mediaType: dataUrlMatch[1], data: dataUrlMatch[2] },
          });
        } else {
          blocks.push({ type: 'image', source: { type: 'url', url } });
        }
      }
      continue;
    }
    if (type === 'file') {
      const file = part['file'] as Record<string, unknown> | undefined;
      const filename = file?.['filename'];
      const fileData = file?.['file_data'];
      const declaredMime = file?.['mime_type'];
      if (typeof filename === 'string' && typeof fileData === 'string') {
        const dataUrlMatch = /^data:([^;]+);base64,([\s\S]*)$/.exec(fileData);
        if (dataUrlMatch?.[1] && dataUrlMatch[2] !== undefined) {
          blocks.push({
            type: 'file',
            filename,
            source: {
              type: 'base64',
              mediaType:
                typeof declaredMime === 'string' && declaredMime.length > 0
                  ? declaredMime
                  : dataUrlMatch[1],
              data: dataUrlMatch[2],
            },
          });
        }
      }
      continue;
    }
    if (typeof part['text'] === 'string') {
      blocks.push({ type: 'text', text: part['text'] });
    }
  }
  return blocks;
}

function wireToolChoiceToCanonical(
  choice: OpenAIWireToolChoice | undefined,
): ToolChoice | undefined {
  if (choice === undefined) return undefined;
  if (choice === 'auto' || choice === 'none' || choice === 'required') return choice;
  return { type: 'tool', name: choice.function.name };
}

export function openAIWireRequestToChatRequest(body: OpenAIWireChatRequest): ChatRequest {
  const systemParts: string[] = [];
  const messages: ProviderMessage[] = [];

  for (const msg of body.messages) {
    if (msg.role === 'system') {
      const text = wireContentToText(msg.content);
      if (text) systemParts.push(text);
      continue;
    }

    if (msg.role === 'tool') {
      const block: ToolResultBlock = {
        type: 'tool_result',
        toolUseId: msg.tool_call_id ?? '',
        content: wireContentToText(msg.content),
      };
      messages.push({ role: 'user', content: [block] });
      continue;
    }

    if (msg.role === 'assistant') {
      const blocks: ContentBlock[] = [];
      for (const thinkingBlock of msg.__canonicalThinking ?? []) {
        if (!thinkingBlock.signature) continue;
        blocks.push({
          type: 'thinking',
          thinking: thinkingBlock.thinking,
          signature: thinkingBlock.signature,
        });
      }
      const text = typeof msg.content === 'string' ? msg.content : wireContentToText(msg.content);
      if (text) {
        const textBlock: TextBlock = { type: 'text', text };
        blocks.push(textBlock);
      }
      for (const call of msg.tool_calls ?? []) {
        let input: Record<string, unknown> = {};
        try {
          const parsed: unknown = JSON.parse(call.function.arguments || '{}');
          if (parsed && typeof parsed === 'object') input = parsed as Record<string, unknown>;
        } catch {
          input = { __raw: call.function.arguments };
        }
        const toolUse: ToolUseBlock = {
          type: 'tool_use',
          id: call.id,
          name: call.function.name,
          input,
        };
        blocks.push(toolUse);
      }
      messages.push({
        role: 'assistant',
        content: blocks.length > 0 ? blocks : (text ?? ''),
      });
      continue;
    }

    if (Array.isArray(msg.content)) {
      const blocks = wireContentToBlocks(msg.content);
      messages.push({ role: 'user', content: blocks.length > 0 ? blocks : '' });
    } else {
      messages.push({ role: 'user', content: msg.content ?? '' });
    }
  }

  const tools: ToolDef[] | undefined = body.tools?.map((tool) => {
    const def: ToolDef = {
      name: tool.function.name,
      description: tool.function.description ?? '',
      inputSchema: tool.function.parameters ?? {},
    };
    if (tool.function.strict !== undefined) def.strict = tool.function.strict;
    return def;
  });

  const request: ChatRequest = { model: body.model, messages };
  if (systemParts.length > 0) request.system = systemParts.join('\n\n');
  if (tools && tools.length > 0) request.tools = tools;
  const toolChoice = wireToolChoiceToCanonical(body.tool_choice);
  if (toolChoice !== undefined) request.toolChoice = toolChoice;
  const maxTokens = body.max_completion_tokens ?? body.max_tokens;
  if (maxTokens !== undefined) request.maxOutputTokens = maxTokens;
  if (body.temperature !== undefined) request.temperature = body.temperature;
  if (body.top_p !== undefined) request.topP = body.top_p;
  if (body.stop !== undefined) {
    request.stopSequences = Array.isArray(body.stop) ? body.stop : [body.stop];
  }
  if (body.metadata !== undefined) request.metadata = body.metadata;
  return request;
}

export type OpenAIWireFinishReason = 'stop' | 'length' | 'tool_calls' | 'content_filter';

function stopReasonToFinishReason(
  reason: Extract<StreamChunk, { type: 'stop' }>['reason'],
): OpenAIWireFinishReason {
  switch (reason) {
    case 'tool_use':
      return 'tool_calls';
    case 'max_tokens':
    case 'pause_turn':
      // The wire has no pause; `length` is its only "incomplete, continuable"
      // value, and `stop` would claim the turn finished
      return 'length';
    case 'refusal':
      // The OpenAI wire's own safety-stop vocabulary — a refusal must reach
      return 'content_filter';
    case 'end_turn':
    case 'stop_sequence':
    case 'error':
    case 'cancel':
      return 'stop';
  }
}

function legacyWebFinishReason(reason: Extract<StreamChunk, { type: 'stop' }>['reason']): string {
  if (reason === 'tool_use') return 'tool_calls';
  if (reason === 'end_turn') return 'stop';
  return reason;
}

/**
 * Ceiling on sources a single web-search tool call renders to the client,
 * enforced here because this is the one place every provider-native search
 * payload (Anthropic `web_search_tool_result`, OpenAI's equivalent, Google's
 * `gemini_grounding_result`) passes through on its way to the wire — none of
 * those providers accept a per-call result-count request parameter, so the
 * cap can only be applied on the way out. Matches the generic (Perplexity)
 * tool's own `WEB_SEARCH_MAX_RESULTS` in apps/web/lib/web-search/web-search-tool.ts.
 */
export const WEB_SEARCH_RESULT_RENDER_CAP = 5;

function capSearchResultPayload(payload: unknown): unknown {
  if (typeof payload !== 'object' || payload === null) return payload;
  const type = (payload as { type?: unknown }).type;
  if (type === 'web_search_tool_result') {
    const content = (payload as { content?: unknown }).content;
    if (Array.isArray(content) && content.length > WEB_SEARCH_RESULT_RENDER_CAP) {
      return { ...payload, content: content.slice(0, WEB_SEARCH_RESULT_RENDER_CAP) };
    }
    return payload;
  }
  if (type === 'gemini_grounding_result') {
    const results = (payload as { results?: unknown }).results;
    if (Array.isArray(results) && results.length > WEB_SEARCH_RESULT_RENDER_CAP) {
      return { ...payload, results: results.slice(0, WEB_SEARCH_RESULT_RENDER_CAP) };
    }
    return payload;
  }
  return payload;
}

export interface OpenAIWireUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface OpenAIWireAssemblerOptions {
  model: string;
  now?: () => number;
  id?: string;
  emitReasoningContent?: boolean;
  wireMode?: 'default' | 'legacy-web' | 'openai-passthrough';
}

export class OpenAIWireAssembler {
  private readonly model: string;
  private readonly now: () => number;
  private readonly id: string;
  private readonly emitReasoning: boolean;
  private readonly wireMode: 'default' | 'legacy-web' | 'openai-passthrough';

  private readonly toolIndexById = new Map<string, number>();
  private readonly vendorIndexById = new Map<string, number>();
  private readonly toolCalls: Array<{ id: string; name: string; args: string }> = [];
  private text = '';
  private reasoning = '';
  private readonly thinkingBlocks: ThinkingBlock[] = [];
  private openThinkingBlock: { thinking: string; signature?: string } | null = null;
  private usage: { input?: number; output?: number; cacheRead?: number; reasoning?: number } = {};
  private finishReason: OpenAIWireFinishReason | null = null;
  private legacyFinishReason: string | null = null;
  private errorMessage: string | null = null;
  private errorCode: string | null = null;
  private errorRetryable: boolean | null = null;

  private insideThinking = false;
  private readonly citations: unknown[] = [];
  private readonly searchResults: unknown[] = [];

  private realId: string | undefined;
  private realCreated: number | undefined;
  private systemFingerprint: string | undefined;
  private serviceTier: string | undefined;
  private openaiPassthroughAnnounced = false;

  constructor(options: OpenAIWireAssemblerOptions) {
    this.model = options.model;
    this.now = options.now ?? Date.now;
    this.id = options.id ?? `chatcmpl-${(options.now ?? Date.now)()}`;
    this.emitReasoning = options.emitReasoningContent ?? false;
    this.wireMode = options.wireMode ?? 'default';
  }

  get lastError(): string | null {
    return this.errorMessage;
  }

  private chunkEnvelope(
    delta: Record<string, unknown>,
    finish: string | null,
    logprobs: unknown = null,
  ) {
    if (this.wireMode === 'legacy-web') {
      const choice: Record<string, unknown> =
        finish !== null ? { delta, finish_reason: finish, index: 0 } : { delta, index: 0 };
      return { choices: [choice], model: this.model };
    }
    if (this.wireMode === 'openai-passthrough') {
      return {
        id: this.realId ?? this.id,
        object: 'chat.completion.chunk' as const,
        created: this.realCreated ?? Math.floor(this.now() / 1000),
        model: this.model,
        ...(this.systemFingerprint !== undefined
          ? { system_fingerprint: this.systemFingerprint }
          : {}),
        ...(this.serviceTier !== undefined ? { service_tier: this.serviceTier } : {}),
        choices: [{ index: 0, delta, logprobs, finish_reason: finish }],
      };
    }
    return {
      id: this.id,
      object: 'chat.completion.chunk' as const,
      created: Math.floor(this.now() / 1000),
      model: this.model,
      choices: [{ index: 0, delta, finish_reason: finish }],
    };
  }

  private streamErrorPayload(): { message: string; code?: string; retryable?: boolean } | null {
    if (this.errorMessage === null) return null;
    return {
      message: this.errorMessage,
      ...(this.errorCode !== null ? { code: this.errorCode } : {}),
      ...(this.errorRetryable !== null ? { retryable: this.errorRetryable } : {}),
    };
  }

  private usageOnlyEnvelope(): Record<string, unknown> | null {
    const usage = this.usageOrNull();
    if (usage === null) return null;
    const fullUsage: Record<string, unknown> = { ...usage };
    if (this.usage.cacheRead !== undefined) {
      fullUsage['prompt_tokens_details'] = { cached_tokens: this.usage.cacheRead };
    }
    if (this.usage.reasoning !== undefined) {
      fullUsage['completion_tokens_details'] = { reasoning_tokens: this.usage.reasoning };
    }
    return {
      id: this.realId ?? this.id,
      object: 'chat.completion.chunk' as const,
      created: this.realCreated ?? Math.floor(this.now() / 1000),
      model: this.model,
      ...(this.systemFingerprint !== undefined
        ? { system_fingerprint: this.systemFingerprint }
        : {}),
      ...(this.serviceTier !== undefined ? { service_tier: this.serviceTier } : {}),
      choices: [],
      usage: fullUsage,
    };
  }

  private wireToolCallIndex(toolUseId: string): number {
    if (this.wireMode === 'legacy-web') {
      const vendorIndex = this.vendorIndexById.get(toolUseId);
      if (vendorIndex !== undefined) return vendorIndex;
    }
    return this.toolIndexById.get(toolUseId) ?? 0;
  }

  ingest(chunk: StreamChunk): void {
    switch (chunk.type) {
      case 'text-delta':
        this.text += chunk.delta;
        return;
      case 'thinking-delta': {
        this.reasoning += chunk.delta;
        const open = this.openThinkingBlock ?? { thinking: '' };
        open.thinking += chunk.delta;
        if (chunk.signature) {
          open.signature = chunk.signature;
          this.thinkingBlocks.push({
            type: 'thinking',
            thinking: open.thinking,
            signature: chunk.signature,
          });
          this.openThinkingBlock = null;
        } else {
          this.openThinkingBlock = open;
        }
        return;
      }
      case 'tool-use-start': {
        if (!this.toolIndexById.has(chunk.toolUseId)) {
          this.toolIndexById.set(chunk.toolUseId, this.toolCalls.length);
          this.toolCalls.push({ id: chunk.toolUseId, name: chunk.name, args: '' });
        }
        if (chunk.vendorIndex !== undefined && !this.vendorIndexById.has(chunk.toolUseId)) {
          this.vendorIndexById.set(chunk.toolUseId, chunk.vendorIndex);
        }
        return;
      }
      case 'tool-use-delta': {
        const index = this.toolIndexById.get(chunk.toolUseId);
        if (index !== undefined) {
          const call = this.toolCalls[index];
          if (call) call.args += chunk.deltaJson;
        }
        return;
      }
      case 'tool-use-end':
        return;
      case 'server-tool-use':
        return;
      case 'server-tool-result': {
        if (
          (this.wireMode !== 'legacy-web' && this.wireMode !== 'openai-passthrough') ||
          typeof chunk.payload !== 'object' ||
          chunk.payload === null
        ) {
          return;
        }
        const payloadType = (chunk.payload as { type?: unknown }).type;
        if (payloadType === 'web_search_tool_result') {
          this.searchResults.push(capSearchResultPayload(chunk.payload));
        } else if (payloadType === 'gemini_grounding_result') {
          const capped = capSearchResultPayload(chunk.payload) as { results?: unknown };
          this.searchResults.push({ content: capped.results });
        }
        return;
      }
      case 'citation-delta':
        if (this.wireMode === 'legacy-web') this.citations.push(chunk.payload);
        return;
      case 'vendor-raw':
        return;
      case 'response-meta':
        if (chunk.id !== undefined) this.realId = chunk.id;
        if (chunk.created !== undefined) this.realCreated = chunk.created;
        if (chunk.systemFingerprint !== undefined) this.systemFingerprint = chunk.systemFingerprint;
        if (chunk.serviceTier !== undefined) this.serviceTier = chunk.serviceTier;
        return;
      case 'usage':
        if (chunk.inputTokens !== undefined) this.usage.input = chunk.inputTokens;
        if (chunk.outputTokens !== undefined) this.usage.output = chunk.outputTokens;
        if (chunk.cacheReadTokens !== undefined) this.usage.cacheRead = chunk.cacheReadTokens;
        if (chunk.reasoningTokens !== undefined) this.usage.reasoning = chunk.reasoningTokens;
        return;
      case 'error':
        this.errorMessage = chunk.message;
        this.errorCode = chunk.code ?? null;
        this.errorRetryable = chunk.retryable ?? null;
        this.finishReason = 'stop';
        this.legacyFinishReason = 'stop';
        return;
      case 'stop':
        this.finishReason = stopReasonToFinishReason(chunk.reason);
        this.legacyFinishReason = legacyWebFinishReason(chunk.reason);
        return;
    }
  }

  sseChunk(chunk: StreamChunk): Record<string, unknown> | null {
    this.ingest(chunk);
    switch (chunk.type) {
      case 'text-delta':
        return this.chunkEnvelope({ content: chunk.delta }, null);
      case 'thinking-delta':
        return this.emitReasoning
          ? this.chunkEnvelope({ reasoning_content: chunk.delta }, null)
          : null;
      case 'tool-use-start':
        return this.chunkEnvelope(
          {
            tool_calls: [
              {
                index: this.toolIndexById.get(chunk.toolUseId) ?? 0,
                id: chunk.toolUseId,
                type: 'function',
                function: { name: chunk.name, arguments: '' },
              },
            ],
          },
          null,
        );
      case 'tool-use-delta':
        return this.chunkEnvelope(
          {
            tool_calls: [
              {
                index: this.toolIndexById.get(chunk.toolUseId) ?? 0,
                function: { arguments: chunk.deltaJson },
              },
            ],
          },
          null,
        );
      case 'stop':
        return this.chunkEnvelope({}, stopReasonToFinishReason(chunk.reason));
      case 'tool-use-end':
      case 'usage':
      case 'server-tool-use':
      case 'server-tool-result':
      case 'citation-delta':
      case 'vendor-raw':
      case 'response-meta':
        return null;
      case 'error':
        return this.chunkEnvelope({}, 'stop');
    }
  }

  sseChunks(chunk: StreamChunk): Record<string, unknown>[] {
    this.ingest(chunk);
    const out: Record<string, unknown>[] = [];
    const legacyWeb = this.wireMode === 'legacy-web';
    const openaiPassthrough = this.wireMode === 'openai-passthrough';
    const richWebSearch = legacyWeb || openaiPassthrough;
    const inlineThinking = legacyWeb || openaiPassthrough;

    if (openaiPassthrough && !this.openaiPassthroughAnnounced) {
      this.openaiPassthroughAnnounced = true;
      out.push(this.chunkEnvelope({ role: 'assistant', content: '' }, null));
    }

    if (inlineThinking) {
      const isThinking = chunk.type === 'thinking-delta';
      if (isThinking && !this.insideThinking) {
        out.push(this.chunkEnvelope({ content: '<thinking>' }, null));
      } else if (!isThinking && this.insideThinking) {
        out.push(this.chunkEnvelope({ content: '</thinking>' }, null));
      }
      this.insideThinking = isThinking;
    }

    switch (chunk.type) {
      case 'server-tool-use': {
        if (!richWebSearch) break;
        const status =
          chunk.name === 'code_execution'
            ? 'executing'
            : chunk.name === 'web_search'
              ? 'searching'
              : chunk.name === 'web_fetch'
                ? 'fetching'
                : 'running';
        const statusPhrase = toolStatusPhrase(chunk.name);
        out.push(
          this.chunkEnvelope(
            {
              x_tool_status: {
                type: 'server_tool_use',
                name: chunk.name,
                status,
                ...(statusPhrase ? { status_phrase: statusPhrase } : {}),
              },
            },
            null,
          ),
        );
        break;
      }
      case 'server-tool-result': {
        if (!richWebSearch) break;
        const payload = chunk.payload as { type?: unknown } | null;
        if (payload?.type === 'code_execution_tool_result') {
          out.push(this.chunkEnvelope({ x_code_result: chunk.payload }, null));
        } else if (payload?.type === 'web_search_tool_result') {
          out.push(this.chunkEnvelope({ x_search_results: capSearchResultPayload(payload) }, null));
        } else if (payload?.type === 'gemini_grounding_result') {
          const results = (capSearchResultPayload(payload) as { results?: unknown }).results;
          out.push(this.chunkEnvelope({ x_search_results: { content: results } }, null));
        }
        break;
      }
      case 'citation-delta': {
        if (!legacyWeb) break;
        out.push({
          type: 'content_block_delta',
          index: chunk.blockIndex,
          delta: { type: 'citations_delta', citation: chunk.payload },
        });
        break;
      }
      case 'vendor-raw': {
        if (!legacyWeb) break;
        out.push(chunk.payload as Record<string, unknown>);
        break;
      }
      case 'text-delta':
        out.push(this.chunkEnvelope({ content: chunk.delta }, null, chunk.logprobs ?? null));
        break;
      case 'thinking-delta':
        if (inlineThinking) {
          out.push(this.chunkEnvelope({ content: chunk.delta }, null));
        } else if (this.emitReasoning) {
          out.push(this.chunkEnvelope({ reasoning_content: chunk.delta }, null));
        }
        break;
      case 'tool-use-start':
        out.push(
          this.chunkEnvelope(
            {
              tool_calls: [
                {
                  index: this.wireToolCallIndex(chunk.toolUseId),
                  id: chunk.toolUseId,
                  type: 'function',
                  function: { name: chunk.name, arguments: '' },
                },
              ],
            },
            null,
            chunk.logprobs ?? null,
          ),
        );
        break;
      case 'tool-use-delta':
        out.push(
          this.chunkEnvelope(
            {
              tool_calls: [
                {
                  index: this.wireToolCallIndex(chunk.toolUseId),
                  function: { arguments: chunk.deltaJson },
                },
              ],
            },
            null,
            chunk.logprobs ?? null,
          ),
        );
        break;
      case 'stop':
        out.push(
          this.chunkEnvelope(
            {},
            legacyWeb ? this.legacyFinishReason : stopReasonToFinishReason(chunk.reason),
          ),
        );
        break;
      case 'error':
        out.push(
          this.chunkEnvelope(
            {
              ...(this.streamErrorPayload() !== null
                ? { x_stream_error: this.streamErrorPayload() }
                : {}),
            },
            legacyWeb ? (this.legacyFinishReason ?? 'stop') : 'stop',
          ),
        );
        break;
      case 'usage':
        if (openaiPassthrough) {
          const usageChunk = this.usageOnlyEnvelope();
          if (usageChunk !== null) out.push(usageChunk);
        }
        break;
      case 'tool-use-end':
      case 'response-meta':
        break;
    }
    return out;
  }

  canonicalThinkingBlocks(): ThinkingBlock[] {
    return this.thinkingBlocks.map((block) => ({ ...block }));
  }

  canonicalText(): string {
    return this.text;
  }

  usageOrNull(): OpenAIWireUsage | null {
    if (this.usage.input === undefined && this.usage.output === undefined) return null;
    const prompt = this.usage.input ?? 0;
    const completion = this.usage.output ?? 0;
    return {
      prompt_tokens: prompt,
      completion_tokens: completion,
      total_tokens: prompt + completion,
    };
  }

  response(): Record<string, unknown> {
    const message: Record<string, unknown> = {
      role: 'assistant',
      content: this.text.length > 0 ? this.text : null,
    };
    if (this.emitReasoning && this.reasoning.length > 0) {
      message['reasoning_content'] = this.reasoning;
    }
    if (this.toolCalls.length > 0) {
      message['tool_calls'] = this.toolCalls.map((call, index) => ({
        id: call.id,
        type: 'function',
        index,
        function: { name: call.name, arguments: call.args },
      }));
    }

    const usage = this.usageOrNull();
    const legacyWeb = this.wireMode === 'legacy-web';
    const richWebSearch = legacyWeb || this.wireMode === 'openai-passthrough';
    const finishReason = legacyWeb
      ? (this.legacyFinishReason ?? (this.toolCalls.length > 0 ? 'tool_calls' : 'stop'))
      : (this.finishReason ?? (this.toolCalls.length > 0 ? 'tool_calls' : 'stop'));
    return {
      id: this.id,
      object: 'chat.completion',
      created: Math.floor(this.now() / 1000),
      model: this.model,
      choices: [
        {
          index: 0,
          message,
          finish_reason: finishReason,
        },
      ],
      ...(usage ? { usage } : {}),
      ...(legacyWeb && this.citations.length > 0 ? { citations: this.citations } : {}),
      ...(richWebSearch && this.searchResults.length > 0
        ? { search_results: this.searchResults }
        : {}),
    };
  }
}

export function assembleOpenAIWireResponse(
  chunks: Iterable<StreamChunk>,
  options: OpenAIWireAssemblerOptions,
): Record<string, unknown> {
  const assembler = new OpenAIWireAssembler(options);
  for (const chunk of chunks) assembler.ingest(chunk);
  return assembler.response();
}
