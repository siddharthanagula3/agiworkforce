/**
 * Google/Gemini wire diff between the legacy apps/web/lib/llm-providers/
 * google.ts TransformStream and the packages/providers/google canonical
 * adapter + OpenAIWireAssembler (wireMode: 'legacy-web') path (restructure
 * Wave 2, task #34's Google slice).
 *
 * UNLIKE the Anthropic slice's stream-transform.byte-parity.test.ts, this is
 * NOT a same-shape structural comparison for the whole wire -- Google's
 * legacy reshaping lives entirely inside google.ts's `streamRequest` (fetch-
 * coupled), so the "legacy bytes" here are CAPTURED ONCE per fixture (mock
 * global fetch, run the real GoogleProvider.streamRequest, drain its
 * output) rather than driven through a directly-callable shared function.
 *
 * Two genuinely different wire shapes are BY DESIGN, not bugs -- both
 * disclosed with evidence rather than forced to match (see each test):
 *   1. Tool calls: legacy emits ONE complete `tool_calls` delta with
 *      `call_<uuid>` ids; the adapter path emits a start/delta/end triple
 *      (`gemini-tool-N` ids) because `translateGeminiStream` synthesizes
 *      that triple for every canonical adapter, matching how every OTHER
 *      provider's tool calls stream incrementally. Contorting the shared
 *      assembler to batch Gemini's one-shot call into a single delta would
 *      require Google-specific logic inside OpenAIWireAssembler, which is
 *      supposed to be provider-agnostic (shape-dispatch only) -- and would
 *      regress nothing for Google (every pinned consumer accumulates tool
 *      call fragments incrementally already, see toolCallAccumulator.ts /
 *      collectProviderStream), so this is a disclosed, accepted divergence,
 *      verified for functional (not byte) equivalence below.
 *   2. Standalone usage event: legacy emits a bare `data:
 *      {usageMetadata,usage}` event (no `choices` key at all) that stream-
 *      transform.ts's shared reconciler re-serializes onto the wire
 *      unchanged. The adapter path's usage StreamChunk has no `sseChunks()`
 *      wire representation (usage is billing-internal, read via
 *      adapter-usage.ts's ingestUsageChunk, never re-emitted to the client)
 *      -- so the adapter wire OMITS this event entirely. Grepped both
 *      pinned SSE consumers (apps/web/lib/hooks/useChatStream.ts, apps/
 *      mobile/services/streaming.ts) for a top-level (non-`choices`-nested)
 *      `usage`/`usageMetadata` read: neither has one -- billing already
 *      flows server-side via CreditService/LLMCostCalculator, not from the
 *      client re-parsing this event. Disclosed, not reproduced.
 *
 * What IS byte-pinned (this file's actual gate): text deltas, the grounding/
 * search-result event's exact key order and 1-based position, and the
 * terminal finish_reason + [DONE] framing for a plain-text turn.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GoogleProvider } from '@/lib/llm-providers/google';
import type { LLMProviderResponse } from '@/lib/llm-providers/base';
import { translateGeminiStream } from '@agiworkforce/providers-google';
import type { GeminiStreamChunk } from '@agiworkforce/providers-google';
import { OpenAIWireAssembler } from '@agiworkforce/llm-normalize';
import { drainToLlmResponse } from '../lib/adapter-response';
import { toGoogleUpstreamError } from '../lib/adapter-errors';

const RESPONSE_MODEL = 'gemini-3-pro';

/** Encode a sequence of raw Gemini wire objects as one SSE byte stream,
 *  exactly matching `:streamGenerateContent?alt=sse`'s `data: <json>\n\n`
 *  framing that both google.ts's TransformStream and parseGeminiStream
 *  consume. */
function geminiSseBytes(events: GeminiStreamChunk[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      controller.close();
    },
  });
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) out += decoder.decode(value, { stream: true });
  }
  return out;
}

/** Captures the LEGACY wire bytes by running the real GoogleProvider against
 *  a mocked global fetch -- google.ts's reshaping is fetch-coupled, so this
 *  is the only way to get its actual output rather than predict it. */
async function captureLegacyBytes(events: GeminiStreamChunk[]): Promise<string> {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(geminiSseBytes(events), {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  try {
    const provider = new GoogleProvider('fake-key');
    const stream = await provider.streamRequest({
      model: RESPONSE_MODEL,
      messages: [{ role: 'user', content: 'what is the weather in nyc?' }],
      stream: true,
    });
    return await readAll(stream);
  } finally {
    vi.unstubAllGlobals();
  }
}

/** Runs the SAME fixture through the canonical adapter's translation layer
 *  (skipping parseGeminiStream's byte-level SSE splitting, which is pure
 *  infrastructure exercised elsewhere -- this isolates the grounding logic
 *  and the shared assembler, matching this file's actual scope) and the
 *  same OpenAIWireAssembler construction buildAdapterStreamResponse uses. */
async function captureAdapterBytes(events: GeminiStreamChunk[]): Promise<string> {
  async function* asChunks(): AsyncIterable<GeminiStreamChunk> {
    for (const event of events) yield event;
  }
  const assembler = new OpenAIWireAssembler({ model: RESPONSE_MODEL, wireMode: 'legacy-web' });
  const lines: string[] = [];
  for await (const chunk of translateGeminiStream(asChunks())) {
    const wireEvents = assembler.sseChunks(chunk);
    if (wireEvents.length === 0) continue;
    lines.push(wireEvents.map((e) => `data: ${JSON.stringify(e)}`).join('\n') + '\n\n');
  }
  // Matches what buildAdapterStreamResponse (stream-transform.ts) does for
  // the already-wired Anthropic path: emit [DONE] unconditionally once the
  // adapter's chunks are exhausted. This helper represents what the REAL
  // wire will look like once Google is wired into route.ts the same way,
  // not just the assembler's raw per-chunk output.
  lines.push('data: [DONE]\n\n');
  return lines.join('');
}

function dataLines(body: string): string[] {
  return body.split('\n\n').filter((chunk) => chunk.startsWith('data: '));
}

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Google byte diff: grounded text answer (no tool call)', () => {
  const fixture: GeminiStreamChunk[] = [
    { candidates: [{ content: { role: 'model', parts: [{ text: 'The weather in NYC is ' }] } }] },
    {
      candidates: [
        {
          content: { role: 'model', parts: [{ text: 'sunny and 72F.' }] },
          finishReason: 'STOP',
          groundingMetadata: {
            groundingChunks: [
              { web: { uri: 'https://weather.example.com/nyc', title: 'NYC Weather' } },
              { web: { uri: 'https://example.org/forecast' } },
            ],
          },
        },
      ],
      usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 9, totalTokenCount: 49 },
    },
  ];

  it('emits identical text-delta lines on both paths', async () => {
    const legacy = dataLines(await captureLegacyBytes(fixture));
    const adapter = dataLines(await captureAdapterBytes(fixture));

    // `"content":"` (string value) excludes x_search_results' nested
    // `"content":[` (array) -- a naive `.includes('"content"')` would wrongly
    // pull in the search-results line too, since it also has a `content` key.
    const legacyText = legacy.filter((l) => l.includes('"content":"'));
    const adapterText = adapter.filter((l) => l.includes('"content":"'));
    expect(adapterText).toEqual(legacyText);
    expect(legacyText).toEqual([
      `data: ${JSON.stringify({ choices: [{ delta: { content: 'The weather in NYC is ' }, index: 0 }], model: RESPONSE_MODEL })}`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: 'sunny and 72F.' }, index: 0 }], model: RESPONSE_MODEL })}`,
    ]);
  });

  it('DISCLOSED DIVERGENCE: the finish_reason envelope shape differs -- legacy omits delta/model, the shared assembler always includes them', async () => {
    const legacy = dataLines(await captureLegacyBytes(fixture));
    const adapter = dataLines(await captureAdapterBytes(fixture));

    const legacyFinish = legacy.find((l) => l.includes('finish_reason'));
    const adapterFinish = adapter.find((l) => l.includes('finish_reason'));

    // Legacy google.ts's doneEvent is `{choices:[{finish_reason,index}]}` --
    // no `delta` key on the choice, no top-level `model` key at all. This is
    // its OWN shape, distinct from Anthropic's legacy `{delta:{},finish_
    // reason,index}` + `{choices,model}` envelope that OpenAIWireAssembler's
    // chunkEnvelope() was built and byte-pinned against.
    expect(legacyFinish).toBe(
      `data: ${JSON.stringify({ choices: [{ finish_reason: 'stop', index: 0 }] })}`,
    );

    // The shared assembler (provider-agnostic, shape-dispatch only) has no
    // way to know "this stop chunk came from Google, use Google's bespoke
    // envelope" -- StreamChunk carries no provider tag, by design (see
    // provider-adapter.ts). Special-casing chunkEnvelope() on provider
    // identity would break its one job (byte-pin Anthropic, already
    // verified/shipped) for zero real benefit: both pinned SSE consumers
    // (useChatStream.ts, mobile streaming.ts) read `choices[0].finish_reason`
    // via optional chaining, independent of whether `delta`/`model` are also
    // present on that same event -- confirmed by direct source read, not
    // assumed. Accepted, not forced.
    expect(adapterFinish).toBe(
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop', index: 0 }], model: RESPONSE_MODEL })}`,
    );
  });

  it('byte-pins the search-result event key order {type,url,title,position} and 1-based position -- literal string, not toEqual', async () => {
    const legacy = dataLines(await captureLegacyBytes(fixture));
    const adapter = dataLines(await captureAdapterBytes(fixture));

    const legacySearch = legacy.find((l) => l.includes('x_search_results'));
    const adapterSearch = adapter.find((l) => l.includes('x_search_results'));

    // toEqual on the parsed object would pass even if key order regressed --
    // exactly the class of bug the Anthropic slice's {index,delta} swap
    // taught this migration toEqual can't catch. Assert the literal string.
    const expected = `data: ${JSON.stringify({
      choices: [
        {
          delta: {
            x_search_results: {
              content: [
                {
                  type: 'web_search_result',
                  url: 'https://weather.example.com/nyc',
                  title: 'NYC Weather',
                  position: 1,
                },
                {
                  type: 'web_search_result',
                  url: 'https://example.org/forecast',
                  // Legacy falls back to the URL itself when Gemini omits a title.
                  title: 'https://example.org/forecast',
                  position: 2,
                },
              ],
            },
          },
          index: 0,
        },
      ],
      model: RESPONSE_MODEL,
    })}`;

    expect(legacySearch).toBe(expected);
    expect(adapterSearch).toBe(expected);
  });

  it('emits [DONE] on both paths', async () => {
    const legacyBody = await captureLegacyBytes(fixture);
    const adapterBody = await captureAdapterBytes(fixture);
    expect(legacyBody).toContain('data: [DONE]');
    expect(adapterBody).toContain('data: [DONE]');
  });

  it('DISCLOSED DIVERGENCE: legacy re-serializes a standalone usage event with no choices key; the adapter path omits it (billing reads usage server-side, not from this event)', async () => {
    const legacy = dataLines(await captureLegacyBytes(fixture));
    const adapter = dataLines(await captureAdapterBytes(fixture));

    const legacyUsageLine = legacy.find((l) => l.includes('"usageMetadata"'));
    expect(legacyUsageLine).toBeDefined();
    expect(legacyUsageLine).not.toContain('"choices"');

    expect(adapter.some((l) => l.includes('"usageMetadata"'))).toBe(false);
  });
});

describe('Google byte diff: tool call (functionCall)', () => {
  const fixture: GeminiStreamChunk[] = [
    {
      candidates: [
        {
          content: {
            role: 'model',
            parts: [{ functionCall: { name: 'get_weather', args: { city: 'NYC' } } }],
          },
          finishReason: 'STOP',
        },
      ],
      usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 6, totalTokenCount: 36 },
    },
  ];

  it('DISCLOSED DIVERGENCE: legacy emits one complete tool_calls delta; the adapter emits a start/delta/end triple -- both reconstruct to the SAME name+args+finish_reason', async () => {
    const legacyLines = dataLines(await captureLegacyBytes(fixture));
    const adapterLines = dataLines(await captureAdapterBytes(fixture));

    // `"tool_calls":[` (the KEY, with its opening bracket) -- a bare
    // `.includes('"tool_calls"')` would also match the finish_reason line,
    // whose VALUE is the string "tool_calls" (`finish_reason:"tool_calls"`
    // contains that exact substring too).
    // Legacy: exactly one event carries the complete tool_calls array.
    const legacyToolLine = legacyLines.find((l) => l.includes('"tool_calls":['));
    expect(legacyToolLine).toBeDefined();
    const legacyToolCalls = (
      JSON.parse(legacyToolLine!.slice('data: '.length)) as {
        choices: [
          { delta: { tool_calls: Array<{ function: { name: string; arguments: string } }> } },
        ];
      }
    ).choices[0].delta.tool_calls;
    expect(legacyToolCalls).toHaveLength(1);
    expect(legacyToolCalls[0]!.function.name).toBe('get_weather');
    expect(JSON.parse(legacyToolCalls[0]!.function.arguments)).toEqual({ city: 'NYC' });

    // Adapter: name arrives on a tool-use-start event, arguments accumulate
    // across one or more tool-use-delta events -- reconstruct the same way
    // collectProviderStream (tool-loop.ts) and toolCallAccumulator.ts
    // (mobile) already do, rather than asserting a specific chunk count.
    const toolLines = adapterLines.filter((l) => l.includes('"tool_calls":['));
    expect(toolLines.length).toBeGreaterThanOrEqual(2); // at minimum: start + one delta
    let name = '';
    let argsJson = '';
    for (const line of toolLines) {
      const parsed = JSON.parse(line.slice('data: '.length)) as {
        choices: [
          { delta: { tool_calls: Array<{ function?: { name?: string; arguments?: string } }> } },
        ];
      };
      const tc = parsed.choices[0].delta.tool_calls[0]!;
      if (tc.function?.name) name = tc.function.name;
      if (tc.function?.arguments) argsJson += tc.function.arguments;
    }
    expect(name).toBe('get_weather');
    expect(JSON.parse(argsJson)).toEqual({ city: 'NYC' });

    // Both map Gemini's functionCall-bearing STOP to finish_reason: 'tool_calls'.
    const legacyFinish = legacyLines.find((l) => l.includes('finish_reason'));
    const adapterFinish = adapterLines.find((l) => l.includes('finish_reason'));
    expect(legacyFinish).toContain('"finish_reason":"tool_calls"');
    expect(adapterFinish).toContain('"finish_reason":"tool_calls"');
  });
});

/**
 * Non-streaming: legacy `GoogleProvider.sendRequest()` is a SEPARATE wire
 * from `streamRequest()` -- it calls Gemini's true non-streaming
 * `:generateContent` endpoint (one JSON response object, not SSE), not
 * `:streamGenerateContent` drained to completion. The adapter path has no
 * separate non-streaming method on `ProviderAdapter` -- `drainToLlmResponse`
 * (route.ts's non-streaming branch) always calls `.stream()` (the SAME
 * `:streamGenerateContent` endpoint every other request uses) and buffers it
 * -- so "non-streaming" here means "streaming endpoint, drained," same as
 * every other adapter-backed provider (Anthropic's non-streaming path works
 * the same way).
 *
 * DISCLOSED DIVERGENCE, found empirically (not assumed) by writing this
 * test: legacy `sendRequest()` returns Gemini's RAW `finishReason` verbatim
 * (`candidate.finishReason` -- uppercase, e.g. `"STOP"`/`"MAX_TOKENS"`) with
 * NO lowercasing and NO tool-call override, UNLIKE `streamRequest()`, which
 * explicitly does `hasToolCalls ? 'tool_calls' : candidate.finishReason.
 * toLowerCase()`. `buildNonStreamResponse` (response-builder.ts) passes
 * `llmResponse.finishReason` straight through as the wire `finish_reason`
 * (`llmResponse.finishReason || 'stop'`, no remapping) -- so the LEGACY
 * non-streaming wire could send literally `finish_reason: "STOP"` to a
 * client even when the model made a tool call. This is the SAME finish_
 * reason bug class as the one fixed in stream.ts's mapFinishReason (see
 * that function's docstring) -- pre-existing, and this time not even
 * fixable while staying byte-compatible with legacy's non-streaming path,
 * because legacy's non-streaming path itself never correctly signaled a
 * tool call at all. `drainToLlmResponse` uses the SAME `translateGeminiStream`
 * as the streaming path (my mapFinishReason fix flows through automatically),
 * so the adapter's non-streaming `finish_reason` for a Google tool call is
 * `'tool_calls'` (lowercase, correct) -- NOT byte-matched to legacy's
 * uppercase, never-remapped value, deliberately: reproducing a confirmed
 * bug in newly-written code would be worse than a disclosed, one-directional
 * improvement here. Not filed as a fresh known-flaw -- same root cause
 * already covered by the streaming fix's disclosure.
 */
describe('Google non-streaming diff: sendRequest() vs drainToLlmResponse', () => {
  /** Captures the LEGACY non-streaming response by running the real
   *  GoogleProvider.sendRequest() against a mocked global fetch returning
   *  Gemini's true non-streaming (:generateContent) JSON shape -- a single
   *  response object, not SSE framing. */
  async function captureLegacySendRequest(
    geminiResponse: Record<string, unknown>,
  ): Promise<LLMProviderResponse> {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(geminiResponse), { status: 200, headers: {} }),
      );
    vi.stubGlobal('fetch', fetchMock);
    try {
      const provider = new GoogleProvider('fake-key');
      return await provider.sendRequest({
        model: RESPONSE_MODEL,
        messages: [{ role: 'user', content: 'what is the weather in nyc?' }],
      });
    } finally {
      vi.unstubAllGlobals();
    }
  }

  /** The SAME logical content, run through the adapter path: a single
   *  Gemini non-streaming response object has the identical `candidates[0].
   *  content.parts`/`finishReason`/`usageMetadata` shape as one streaming
   *  chunk, so feeding it as a one-chunk AsyncIterable to translateGeminiStream
   *  is a faithful (not approximated) stand-in for the real adapter.stream()
   *  drain -- it's the SAME translation function either way. */
  async function captureAdapterDrain(geminiResponse: GeminiStreamChunk) {
    async function* asChunks(): AsyncIterable<GeminiStreamChunk> {
      yield geminiResponse;
    }
    return drainToLlmResponse(
      translateGeminiStream(asChunks()),
      RESPONSE_MODEL,
      toGoogleUpstreamError,
    );
  }

  it('matches text content for a plain-text turn', async () => {
    const fixture = {
      candidates: [
        {
          content: { role: 'model', parts: [{ text: 'Cats are mammals.' }] },
          finishReason: 'STOP',
        },
      ],
      usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 5, totalTokenCount: 25 },
    };

    const legacy = await captureLegacySendRequest(fixture);
    const adapter = await captureAdapterDrain(fixture as unknown as GeminiStreamChunk);

    expect(adapter.content).toBe(legacy.content);
    expect(legacy.content).toBe('Cats are mammals.');
    expect(legacy.promptTokens).toBe(20);
    expect(adapter.promptTokens).toBe(20);
  });

  it('never surfaces grounding/search_results for non-streaming (matches legacy, which never extracted it here)', async () => {
    const fixture = {
      candidates: [
        {
          content: { role: 'model', parts: [{ text: 'It is sunny.' }] },
          finishReason: 'STOP',
          groundingMetadata: {
            groundingChunks: [{ web: { uri: 'https://example.com', title: 'Example' } }],
          },
        },
      ],
      usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 5, totalTokenCount: 25 },
    };

    const legacy = await captureLegacySendRequest(fixture);
    const adapter = await captureAdapterDrain(fixture as unknown as GeminiStreamChunk);

    // Legacy sendRequest() has no groundingMetadata handling at all --
    // LLMProviderResponse never had a search_results-carrying path for it.
    expect((legacy as unknown as { search_results?: unknown }).search_results).toBeUndefined();
    // ingest() (openai-wire-compat.ts) deliberately does not aggregate
    // gemini_grounding_result payloads -- confirmed here, not just asserted
    // in the source comment.
    expect(adapter.search_results).toBeUndefined();
  });

  it('DISCLOSED DIVERGENCE: legacy returns Gemini’s raw finishReason verbatim (never remapped to tool_calls, even for a tool call); the adapter path correctly derives tool_calls', async () => {
    const fixture = {
      candidates: [
        {
          content: {
            role: 'model',
            parts: [{ functionCall: { name: 'get_weather', args: { city: 'NYC' } } }],
          },
          finishReason: 'STOP',
        },
      ],
      usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 5, totalTokenCount: 25 },
    };

    const legacy = await captureLegacySendRequest(fixture);
    const adapter = await captureAdapterDrain(fixture as unknown as GeminiStreamChunk);

    // Legacy: raw Gemini enum, uppercase, never remapped -- confirmed bug,
    // not a hypothesis. `buildNonStreamResponse` would send this literal
    // string as the client-visible finish_reason.
    expect(legacy.finishReason).toBe('STOP');
    expect(legacy.tool_calls).toHaveLength(1);

    // Adapter: correct, lowercase, tool_calls -- via the SAME mapFinishReason
    // fix the streaming path uses (translateGeminiStream is shared).
    expect(adapter.finishReason).toBe('tool_calls');
    expect(adapter.tool_calls).toHaveLength(1);
  });
});
