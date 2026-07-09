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

/**
 * The web v1 route's ACTUAL pre-migration finish_reason mapping -- verified
 * against apps/web/lib/llm-providers/anthropic.ts's identical streaming
 * (stream-transform.ts) and non-streaming derivation, both:
 * `stopReason === 'tool_use' ? 'tool_calls' : stopReason === 'end_turn' ?
 * 'stop' : stopReason`. Unlike `stopReasonToFinishReason` above, this does
 * NOT map `max_tokens` to `'length'` -- the legacy wire emits the literal
 * string `'max_tokens'` as `finish_reason`. Used only in `wireMode:
 * 'legacy-web'` so `sseChunk()`'s existing (api-gateway) behavior is
 * untouched.
 */
function legacyWebFinishReason(reason: Extract<StreamChunk, { type: 'stop' }>['reason']): string {
  if (reason === 'tool_use') return 'tool_calls';
  if (reason === 'end_turn') return 'stop';
  return reason;
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
   * Read by `sseChunk()`/`response()` only -- `sseChunks()` uses `wireMode`
   * instead (see below).
   */
  emitReasoningContent?: boolean;
  /**
   * `'default'` (unchanged): `sseChunk()`/`ingest()`/`response()` behave
   * exactly as before this option existed -- the new server-tool-use/
   * server-tool-result/citation-delta/vendor-raw chunk types produce no
   * wire output and no `response()` fields, so an existing caller (e.g.
   * services/api-gateway) sees byte-identical behavior even though the
   * adapter it consumes may now emit these chunk types.
   *
   * `'legacy-web'`: reproduces the web v1 route's pre-Wave-2 wire exactly
   * (captured via golden fixture, see apps/web/app/api/llm/v1/chat/
   * completions/__tests__/stream-transform.golden.test.ts and response-
   * builder.golden.test.ts) --
   *   - streaming, via the new `sseChunks()` method (NOT `sseChunk()`,
   *     whose one-chunk-in-one-chunk-out signature can't represent the
   *     inline <thinking>/</thinking> tag pair a single thinking-delta
   *     transition needs): inline `<thinking>`/`</thinking>` tags wrapped
   *     around thinking-delta content, `x_tool_status` for server-tool-use,
   *     `x_search_results`/`x_code_result` for server-tool-result, and raw
   *     vendor-shaped passthrough for citation-delta/vendor-raw chunks;
   *   - non-streaming, via `response()`: aggregates citation-delta payloads
   *     into a `citations` array and server-tool-result payloads whose
   *     `payload.type === 'web_search_tool_result'` into a `search_results`
   *     array (code-execution results are NOT aggregated here -- the
   *     legacy non-streaming response never surfaced them either, only its
   *     streaming wire did via x_code_result);
   *   - both: finish_reason uses the legacy web mapping (tool_use ->
   *     tool_calls, end_turn -> stop, everything else passed through
   *     as-is -- e.g. max_tokens stays 'max_tokens', not 'length').
   */
  wireMode?: 'default' | 'legacy-web';
}

/**
 * Stateful canonical-chunk -> OpenAI-wire assembler.
 *
 * Streaming: call `sseChunk(chunk)` per canonical chunk (single wire object
 * or null per input; `wireMode` does not affect this method) or
 * `sseChunks(chunk)` (array, always empty-or-more; honors `wireMode` --
 * needed for `'legacy-web'`'s multi-chunk-per-event thinking tags). Pick
 * one and use it consistently for a given stream. Non-streaming: feed every
 * chunk through `ingest(chunk)` (or either sse method, which ingest too)
 * and call `response()`.
 */
export class OpenAIWireAssembler {
  private readonly model: string;
  private readonly now: () => number;
  private readonly id: string;
  private readonly emitReasoning: boolean;
  private readonly wireMode: 'default' | 'legacy-web';

  private readonly toolIndexById = new Map<string, number>();
  /** `sseChunks()`-only, `wireMode: 'legacy-web'`-only: `tool-use-start`'s
   *  `vendorIndex`, when present, keyed by toolUseId so later `tool-use-
   *  delta` chunks for the same call can reuse it. `toolIndexById` above
   *  (0-based, order-of-appearance) is untouched and still drives `sse
   *  Chunk()`/`response()` so existing callers see no behavior change. */
  private readonly vendorIndexById = new Map<string, number>();
  private readonly toolCalls: Array<{ id: string; name: string; args: string }> = [];
  private text = '';
  private reasoning = '';
  private usage: { input?: number; output?: number } = {};
  private finishReason: OpenAIWireFinishReason | null = null;
  private legacyFinishReason: string | null = null;
  private errorMessage: string | null = null;

  /** `sseChunks()`-only state: are we currently inside a thinking block
   *  (i.e. did the last chunk seen start or continue one)? Used to decide
   *  when to emit the inline `<thinking>`/`</thinking>` tag pair. */
  private insideThinking = false;
  /** `wireMode: 'legacy-web'`-only aggregation for `response()`. */
  private readonly citations: unknown[] = [];
  private readonly searchResults: unknown[] = [];

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

  /**
   * `finish` accepts a plain `string` (not just `OpenAIWireFinishReason`)
   * so `sseChunks()`'s `'legacy-web'` mode can pass through
   * `legacyWebFinishReason()`'s untranslated values (e.g. the literal
   * `'max_tokens'`, which is not a member of `OpenAIWireFinishReason`).
   *
   * `'legacy-web'` mode omits `id`/`object`/`created` entirely, and omits
   * `finish_reason` on the choices object unless non-null (rather than the
   * default mode's always-present `finish_reason: null`): verified against
   * the captured golden fixture (apps/web/app/api/llm/v1/chat/completions/
   * __tests__/stream-transform.golden.test.ts) that the legacy web route's
   * per-chunk SSE JSON only ever had `{delta, index}` (plus `finish_reason`
   * on the one terminal chunk) inside a bare `{choices, model}` object --
   * never the full spec-compliant `chat.completion.chunk` envelope real
   * OpenAI (and this assembler's default mode, for `sseChunk()`/
   * api-gateway) sends on every chunk. Safe to gate on `wireMode` here
   * despite `sseChunk()` sharing this method: no existing caller can
   * already be passing `wireMode: 'legacy-web'` -- it's a brand-new option
   * -- so `sseChunk()`'s output for every existing (non-web) caller is
   * unaffected.
   */
  private chunkEnvelope(delta: Record<string, unknown>, finish: string | null) {
    if (this.wireMode === 'legacy-web') {
      // Key order matters here, not just presence -- this reconstructs the
      // literal SSE bytes the legacy route sent (`{delta: {...}, finish_
      // reason: ..., index: 0}` and `{delta: {...}, index: 0}` --
      // apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts's
      // pre-migration object literals, verified via a byte-literal (not
      // structural) test: stream-transform.adapter.test.ts). `toEqual`-based
      // golden fixtures elsewhere in this migration are key-order-blind, so
      // they could not catch a `{index, delta}` vs `{delta, index}` swap --
      // only a literal string comparison could, and did.
      const choice: Record<string, unknown> =
        finish !== null ? { delta, finish_reason: finish, index: 0 } : { delta, index: 0 };
      return { choices: [choice], model: this.model };
    }
    return {
      id: this.id,
      object: 'chat.completion.chunk' as const,
      created: Math.floor(this.now() / 1000),
      model: this.model,
      choices: [{ index: 0, delta, finish_reason: finish }],
    };
  }

  /** `sseChunks()`-only tool_calls[].index: prefers the vendor's own index
   *  in `'legacy-web'` mode (reproducing the pre-migration wire exactly),
   *  falls back to the 0-based order-of-appearance index otherwise --
   *  identical to what `sseChunk()` always uses. */
  private wireToolCallIndex(toolUseId: string): number {
    if (this.wireMode === 'legacy-web') {
      const vendorIndex = this.vendorIndexById.get(toolUseId);
      if (vendorIndex !== undefined) return vendorIndex;
    }
    return this.toolIndexById.get(toolUseId) ?? 0;
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
        // No response()/non-streaming representation in either wire mode
        // (x_tool_status is a streaming-only concept, see sseChunks()).
        return;
      case 'server-tool-result':
        // Only 'legacy-web' aggregates, and only web_search results -- the
        // legacy non-streaming response never surfaced code-execution
        // results (see module docstring / OpenAIWireAssemblerOptions).
        if (
          this.wireMode === 'legacy-web' &&
          typeof chunk.payload === 'object' &&
          chunk.payload !== null &&
          (chunk.payload as { type?: unknown }).type === 'web_search_tool_result'
        ) {
          this.searchResults.push(chunk.payload);
        }
        return;
      case 'citation-delta':
        if (this.wireMode === 'legacy-web') this.citations.push(chunk.payload);
        return;
      case 'vendor-raw':
        // No response()/non-streaming representation -- vendor-raw chunks
        // are, by construction, events the legacy wire never gave any
        // structured meaning to; only their streaming raw-passthrough
        // bytes (sseChunks()) are reproduced.
        return;
      case 'usage':
        if (chunk.inputTokens !== undefined) this.usage.input = chunk.inputTokens;
        if (chunk.outputTokens !== undefined) this.usage.output = chunk.outputTokens;
        return;
      case 'error':
        this.errorMessage = chunk.message;
        this.finishReason = 'stop';
        this.legacyFinishReason = 'stop';
        return;
      case 'stop':
        this.finishReason = stopReasonToFinishReason(chunk.reason);
        this.legacyFinishReason = legacyWebFinishReason(chunk.reason);
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
      // No single-envelope wire representation for any of these in the
      // default mode -- callers that need one (the web v1 route's inline
      // thinking tags, x_tool_status/x_search_results/x_code_result, and raw
      // citation/vendor passthrough) use `sseChunks()` instead, which can
      // return more than one wire object per canonical chunk. Existing
      // `sseChunk()` callers (services/api-gateway) see no new output for
      // the four newer chunk types, matching their behavior before this
      // adapter could even produce them (translateAnthropicStream silently
      // dropped the underlying vendor events).
      case 'tool-use-end':
      case 'usage':
      case 'server-tool-use':
      case 'server-tool-result':
      case 'citation-delta':
      case 'vendor-raw':
        return null;
      case 'error':
        // Error surfaces as a terminal finish chunk; HTTP-level handling is
        // the route's job (it may already have committed a 200 SSE stream).
        return this.chunkEnvelope({}, 'stop');
    }
  }

  /**
   * Convert one canonical chunk into zero or more OpenAI-wire objects.
   *
   * Unlike `sseChunk()` (always exactly one-or-null), a single canonical
   * chunk can need multiple wire outputs -- most notably the first
   * thinking-delta after non-thinking content needs an inline `<thinking>`
   * tag chunk BEFORE its own content chunk, and the reverse (a `</thinking>`
   * tag chunk emitted ahead of whatever the next non-thinking chunk itself
   * produces) when leaving a thinking block. `wireMode: 'default'` never
   * needs more than one, but always returns an array for a single
   * predictable call shape.
   */
  sseChunks(chunk: StreamChunk): Record<string, unknown>[] {
    this.ingest(chunk);
    const out: Record<string, unknown>[] = [];
    const legacyWeb = this.wireMode === 'legacy-web';

    // Inline <thinking>/</thinking> tag boundary, detected from the
    // thinking-delta <-> anything-else transition (the canonical stream has
    // no dedicated "thinking block started/stopped" chunk -- Anthropic's
    // content_block_start/content_block_stop for thinking blocks translate
    // to no StreamChunk at all, see packages/providers/anthropic/src/
    // stream.ts). Runs before the chunk's own translation either way, so a
    // close tag always precedes whatever comes next, and an open tag always
    // precedes the thinking content that triggered it.
    if (legacyWeb) {
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
        if (!legacyWeb) break;
        const status =
          chunk.name === 'code_execution'
            ? 'executing'
            : chunk.name === 'web_search'
              ? 'searching'
              : chunk.name === 'web_fetch'
                ? 'fetching'
                : 'running';
        out.push(
          this.chunkEnvelope(
            { x_tool_status: { type: 'server_tool_use', name: chunk.name, status } },
            null,
          ),
        );
        break;
      }
      case 'server-tool-result': {
        if (!legacyWeb) break;
        const payload = chunk.payload as { type?: unknown } | null;
        if (payload?.type === 'code_execution_tool_result') {
          out.push(this.chunkEnvelope({ x_code_result: chunk.payload }, null));
        } else if (payload?.type === 'web_search_tool_result') {
          out.push(this.chunkEnvelope({ x_search_results: chunk.payload }, null));
        } else if (payload?.type === 'gemini_grounding_result') {
          // Google's grounding payload is pre-shaped (not a verbatim vendor
          // block like Anthropic's) -- see packages/providers/google/src/
          // stream.ts's producer. Unwrap to the legacy web route's exact
          // `{content: [...]}` envelope (NOT chunk.payload verbatim, which
          // would leak the `type` discriminator onto the wire and diverge
          // from apps/web/lib/llm-providers/google.ts's `{ content:
          // resultContent }` byte-for-byte, key-order-sensitive shape).
          const results = (payload as { results?: unknown }).results;
          out.push(this.chunkEnvelope({ x_search_results: { content: results } }, null));
        }
        break;
      }
      case 'citation-delta': {
        if (!legacyWeb) break;
        // Reproduces the legacy wire's raw, unwrapped Anthropic-shaped
        // passthrough (captured via golden fixture) -- NOT a normal
        // chunkEnvelope. See StreamChunkCitation's JSDoc.
        out.push({
          type: 'content_block_delta',
          index: chunk.blockIndex,
          delta: { type: 'citations_delta', citation: chunk.payload },
        });
        break;
      }
      case 'vendor-raw': {
        if (!legacyWeb) break;
        // The captured payload IS the complete raw event already.
        out.push(chunk.payload as Record<string, unknown>);
        break;
      }
      case 'text-delta':
        out.push(this.chunkEnvelope({ content: chunk.delta }, null));
        break;
      case 'thinking-delta':
        if (legacyWeb) {
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
        out.push(this.chunkEnvelope({}, legacyWeb ? (this.legacyFinishReason ?? 'stop') : 'stop'));
        break;
      case 'tool-use-end':
      case 'usage':
        break;
    }
    return out;
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
    const legacyWeb = this.wireMode === 'legacy-web';
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
      // Matches apps/web/lib/llm-providers/anthropic.ts's non-streaming
      // shape: only present, and only non-empty, in 'legacy-web' mode.
      ...(legacyWeb && this.citations.length > 0 ? { citations: this.citations } : {}),
      ...(legacyWeb && this.searchResults.length > 0 ? { search_results: this.searchResults } : {}),
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
