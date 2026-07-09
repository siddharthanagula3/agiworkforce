/**
 * OpenAI Chat Completions wire compatibility for canonical adapters.
 *
 * Two directions, both pure:
 *
 *   1. `openAIWireRequestToChatRequest` — an OpenAI-compatible HTTP request
 *      body (the public `/v1/chat/completions` wire) → canonical
 *      `ChatRequest` consumed by `packages/providers/*` adapters.
 *
 *   2. `OpenAIWireAssembler` — canonical `StreamChunk`s emitted by an
 *      adapter → OpenAI-compatible wire output, either as
 *      `chat.completion.chunk` SSE objects (streaming) or one assembled
 *      `chat.completion` response (non-streaming).
 *
 * Consumers: services/api-gateway `/api/llm/v1/chat/completions`, the web
 * v1 route (restructure Wave 2). The wire shape here mirrors what those
 * routes emitted before the adapter migration so external OpenAI-compatible
 * clients see a byte-stable contract.
 *
 * No IO, no environment access. Time is injected for deterministic tests.
 */

import type {
  ChatRequest,
  ContentBlock,
  ProviderMessage,
  StreamChunk,
  TextBlock,
  ToolChoice,
  ToolDef,
  ToolResultBlock,
  ToolUseBlock,
} from '@agiworkforce/types';

// ============================================================================
// Wire request types (subset of the OpenAI Chat Completions request we accept)
// ============================================================================

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

// ============================================================================
// Request: OpenAI wire -> canonical ChatRequest
// ============================================================================

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

/** Multimodal wire parts (image_url) -> canonical blocks; text parts pass through. */
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
        const dataUrlMatch = /^data:([^;]+);base64,(.*)$/s.exec(url);
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
    // Unknown part types degrade to their text field when present.
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

/**
 * Convert an OpenAI-compatible request body into the canonical `ChatRequest`.
 *
 * Conventions (mirrors packages/providers translate layers, inverse direction):
 * - system messages concatenate into `system`
 * - assistant `tool_calls` become `tool_use` content blocks
 * - `role: "tool"` messages become user messages holding a `tool_result` block
 */
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

    // user
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

// ============================================================================
// Response: canonical StreamChunks -> OpenAI wire
// ============================================================================

export type OpenAIWireFinishReason = 'stop' | 'length' | 'tool_calls' | 'content_filter';

function stopReasonToFinishReason(
  reason: Extract<StreamChunk, { type: 'stop' }>['reason'],
): OpenAIWireFinishReason {
  switch (reason) {
    case 'tool_use':
      return 'tool_calls';
    case 'max_tokens':
      return 'length';
    case 'end_turn':
    case 'stop_sequence':
    case 'error':
    case 'cancel':
      return 'stop';
  }
}

export interface OpenAIWireUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface OpenAIWireAssemblerOptions {
  model: string;
  /** Injected clock for deterministic output in tests. Defaults to Date.now. */
  now?: () => number;
  /** Stable completion id; defaults to `chatcmpl-<now>` like the legacy routes. */
  id?: string;
  /**
   * Emit `thinking-delta` chunks as OpenAI-style `reasoning_content` deltas.
   * Off by default: the legacy gateway wire dropped thinking entirely.
   */
  emitReasoningContent?: boolean;
}

/**
 * Stateful canonical-chunk -> OpenAI-wire assembler.
 *
 * Streaming: call `sseChunk(chunk)` per canonical chunk; null means "nothing
 * to emit for this event". Non-streaming: feed every chunk through
 * `ingest(chunk)` (or `sseChunk`, which ingests too) and call `response()`.
 */
export class OpenAIWireAssembler {
  private readonly model: string;
  private readonly now: () => number;
  private readonly id: string;
  private readonly emitReasoning: boolean;

  private readonly toolIndexById = new Map<string, number>();
  private readonly toolCalls: Array<{ id: string; name: string; args: string }> = [];
  private text = '';
  private reasoning = '';
  private usage: { input?: number; output?: number } = {};
  private finishReason: OpenAIWireFinishReason | null = null;
  private errorMessage: string | null = null;

  constructor(options: OpenAIWireAssemblerOptions) {
    this.model = options.model;
    this.now = options.now ?? Date.now;
    this.id = options.id ?? `chatcmpl-${(options.now ?? Date.now)()}`;
    this.emitReasoning = options.emitReasoningContent ?? false;
  }

  get lastError(): string | null {
    return this.errorMessage;
  }

  private chunkEnvelope(delta: Record<string, unknown>, finish: OpenAIWireFinishReason | null) {
    return {
      id: this.id,
      object: 'chat.completion.chunk' as const,
      created: Math.floor(this.now() / 1000),
      model: this.model,
      choices: [{ index: 0, delta, finish_reason: finish }],
    };
  }

  /** Record a canonical chunk into assembler state without producing wire output. */
  ingest(chunk: StreamChunk): void {
    switch (chunk.type) {
      case 'text-delta':
        this.text += chunk.delta;
        return;
      case 'thinking-delta':
        this.reasoning += chunk.delta;
        return;
      case 'tool-use-start': {
        if (!this.toolIndexById.has(chunk.toolUseId)) {
          this.toolIndexById.set(chunk.toolUseId, this.toolCalls.length);
          this.toolCalls.push({ id: chunk.toolUseId, name: chunk.name, args: '' });
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
      case 'usage':
        if (chunk.inputTokens !== undefined) this.usage.input = chunk.inputTokens;
        if (chunk.outputTokens !== undefined) this.usage.output = chunk.outputTokens;
        return;
      case 'error':
        this.errorMessage = chunk.message;
        this.finishReason = 'stop';
        return;
      case 'stop':
        this.finishReason = stopReasonToFinishReason(chunk.reason);
        return;
    }
  }

  /**
   * Convert one canonical chunk into an OpenAI `chat.completion.chunk`
   * object (or null when the event has no wire representation).
   */
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
        return null;
      case 'error':
        // Error surfaces as a terminal finish chunk; HTTP-level handling is
        // the route's job (it may already have committed a 200 SSE stream).
        return this.chunkEnvelope({}, 'stop');
    }
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

  /** Assemble the non-streaming `chat.completion` response object. */
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
    return {
      id: this.id,
      object: 'chat.completion',
      created: Math.floor(this.now() / 1000),
      model: this.model,
      choices: [
        {
          index: 0,
          message,
          finish_reason: this.finishReason ?? (this.toolCalls.length > 0 ? 'tool_calls' : 'stop'),
        },
      ],
      ...(usage ? { usage } : {}),
    };
  }
}

/** One-shot helper: run a full canonical chunk array into a chat.completion. */
export function assembleOpenAIWireResponse(
  chunks: Iterable<StreamChunk>,
  options: OpenAIWireAssemblerOptions,
): Record<string, unknown> {
  const assembler = new OpenAIWireAssembler(options);
  for (const chunk of chunks) assembler.ingest(chunk);
  return assembler.response();
}
