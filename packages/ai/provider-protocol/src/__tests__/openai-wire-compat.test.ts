import { describe, expect, it } from 'vitest';
import type { StreamChunk } from '@agiworkforce/types';
import {
  OpenAIWireAssembler,
  assembleOpenAIWireResponse,
  openAIWireRequestToChatRequest,
} from '../openai-wire-compat';

const NOW = () => 1_750_000_000_000;
const FIXTURE_MODEL_ID = 'fixture-wire-model';

describe('openAIWireRequestToChatRequest', () => {
  it('extracts system, maps tools and tool_choice, carries sampling params', () => {
    const req = openAIWireRequestToChatRequest({
      model: FIXTURE_MODEL_ID,
      messages: [
        { role: 'system', content: 'be terse' },
        { role: 'user', content: 'hi' },
      ],
      temperature: 0.3,
      max_tokens: 512,
      top_p: 0.9,
      stop: ['END'],
      tools: [
        {
          type: 'function',
          function: { name: 'search', description: 'find', parameters: { type: 'object' } },
        },
      ],
      tool_choice: 'required',
    });

    expect(req.system).toBe('be terse');
    expect(req.messages).toEqual([{ role: 'user', content: 'hi' }]);
    expect(req.tools).toEqual([
      { name: 'search', description: 'find', inputSchema: { type: 'object' } },
    ]);
    expect(req.toolChoice).toBe('required');
    expect(req.maxOutputTokens).toBe(512);
    expect(req.temperature).toBe(0.3);
    expect(req.topP).toBe(0.9);
    expect(req.stopSequences).toEqual(['END']);
  });

  it('maps assistant tool_calls to tool_use blocks and tool messages to tool_result', () => {
    const req = openAIWireRequestToChatRequest({
      model: FIXTURE_MODEL_ID,
      messages: [
        { role: 'user', content: 'weather?' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'weather', arguments: '{"city":"paris"}' },
            },
          ],
        },
        { role: 'tool', tool_call_id: 'call_1', content: 'sunny' },
      ],
    });

    expect(req.messages[1]).toEqual({
      role: 'assistant',
      content: [{ type: 'tool_use', id: 'call_1', name: 'weather', input: { city: 'paris' } }],
    });
    expect(req.messages[2]).toEqual({
      role: 'user',
      content: [{ type: 'tool_result', toolUseId: 'call_1', content: 'sunny' }],
    });
  });

  it('converts image_url parts (data URLs and https) into image blocks', () => {
    const req = openAIWireRequestToChatRequest({
      model: FIXTURE_MODEL_ID,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'what is this?' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,QUJD' } },
            { type: 'image_url', image_url: { url: 'https://example.com/a.png' } },
          ],
        },
      ],
    });

    expect(req.messages[0]?.content).toEqual([
      { type: 'text', text: 'what is this?' },
      { type: 'image', source: { type: 'base64', mediaType: 'image/png', data: 'QUJD' } },
      { type: 'image', source: { type: 'url', url: 'https://example.com/a.png' } },
    ]);
  });

  it('converts hydrated wire files into canonical file blocks', () => {
    const req = openAIWireRequestToChatRequest({
      model: FIXTURE_MODEL_ID,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Summarize this' },
            {
              type: 'file',
              file: {
                filename: 'brief.pdf',
                mime_type: 'application/pdf',
                file_data: 'data:application/pdf;base64,JVBERg==',
              },
            },
          ],
        },
      ],
    });

    expect(req.messages[0]?.content).toEqual([
      { type: 'text', text: 'Summarize this' },
      {
        type: 'file',
        filename: 'brief.pdf',
        source: { type: 'base64', mediaType: 'application/pdf', data: 'JVBERg==' },
      },
    ]);
  });

  it('keeps unparseable tool arguments as __raw instead of throwing', () => {
    const req = openAIWireRequestToChatRequest({
      model: FIXTURE_MODEL_ID,
      messages: [
        {
          role: 'assistant',
          content: '',
          tool_calls: [{ id: 'c1', function: { name: 'run', arguments: '{broken' } }],
        },
      ],
    });
    expect(req.messages[0]?.content).toEqual([
      { type: 'tool_use', id: 'c1', name: 'run', input: { __raw: '{broken' } },
    ]);
  });
});

describe('OpenAIWireAssembler streaming', () => {
  it('emits text deltas, tool-call frames, and the finish chunk', () => {
    const assembler = new OpenAIWireAssembler({
      model: FIXTURE_MODEL_ID,
      now: NOW,
      id: 'chatcmpl-x',
    });

    const text = assembler.sseChunk({ type: 'text-delta', delta: 'Hel' });
    expect(text).toMatchObject({
      id: 'chatcmpl-x',
      object: 'chat.completion.chunk',
      model: FIXTURE_MODEL_ID,
      choices: [{ index: 0, delta: { content: 'Hel' }, finish_reason: null }],
    });

    const start = assembler.sseChunk({ type: 'tool-use-start', toolUseId: 'tu_1', name: 'search' });
    expect(start?.['choices']).toEqual([
      {
        index: 0,
        delta: {
          tool_calls: [
            { index: 0, id: 'tu_1', type: 'function', function: { name: 'search', arguments: '' } },
          ],
        },
        finish_reason: null,
      },
    ]);

    const delta = assembler.sseChunk({
      type: 'tool-use-delta',
      toolUseId: 'tu_1',
      deltaJson: '{"q":',
    });
    expect(delta?.['choices']).toEqual([
      {
        index: 0,
        delta: { tool_calls: [{ index: 0, function: { arguments: '{"q":' } }] },
        finish_reason: null,
      },
    ]);

    expect(assembler.sseChunk({ type: 'tool-use-end', toolUseId: 'tu_1' })).toBeNull();
    expect(assembler.sseChunk({ type: 'usage', inputTokens: 10, outputTokens: 4 })).toBeNull();

    const stop = assembler.sseChunk({ type: 'stop', reason: 'tool_use' });
    expect(stop?.['choices']).toEqual([{ index: 0, delta: {}, finish_reason: 'tool_calls' }]);
  });

  it('drops thinking deltas unless reasoning emission is enabled', () => {
    const silent = new OpenAIWireAssembler({ model: FIXTURE_MODEL_ID, now: NOW });
    expect(silent.sseChunk({ type: 'thinking-delta', delta: 'hmm' })).toBeNull();

    const loud = new OpenAIWireAssembler({
      model: FIXTURE_MODEL_ID,
      now: NOW,
      emitReasoningContent: true,
    });
    const chunk = loud.sseChunk({ type: 'thinking-delta', delta: 'hmm' });
    expect(chunk?.['choices']).toEqual([
      { index: 0, delta: { reasoning_content: 'hmm' }, finish_reason: null },
    ]);
  });

  it('assigns increasing tool indexes per toolUseId', () => {
    const assembler = new OpenAIWireAssembler({ model: FIXTURE_MODEL_ID, now: NOW });
    assembler.sseChunk({ type: 'tool-use-start', toolUseId: 'a', name: 'one' });
    const second = assembler.sseChunk({ type: 'tool-use-start', toolUseId: 'b', name: 'two' });
    const calls = (
      second?.['choices'] as Array<{ delta: { tool_calls: Array<{ index: number }> } }>
    )[0]?.delta.tool_calls;
    expect(calls?.[0]?.index).toBe(1);
  });

  it('adds native search activity and source cards in openai-passthrough mode', () => {
    const assembler = new OpenAIWireAssembler({
      model: FIXTURE_MODEL_ID,
      now: NOW,
      wireMode: 'openai-passthrough',
    });

    const started = assembler.sseChunks({
      type: 'server-tool-use',
      toolUseId: 'ws_1',
      name: 'web_search',
    });
    const completed = assembler.sseChunks({
      type: 'server-tool-result',
      toolUseId: 'ws_1',
      payload: {
        type: 'web_search_tool_result',
        tool_use_id: 'ws_1',
        content: [
          {
            type: 'web_search_result',
            url: 'https://developers.openai.com/api/docs/guides/tools-web-search',
            title: 'Web search | OpenAI API',
          },
        ],
      },
    });

    expect((started.at(-1) as { choices: Array<{ delta: unknown }> }).choices[0]?.delta).toEqual({
      x_tool_status: { type: 'server_tool_use', name: 'web_search', status: 'searching' },
    });
    expect((completed[0] as { choices: Array<{ delta: unknown }> }).choices[0]?.delta).toEqual({
      x_search_results: {
        type: 'web_search_tool_result',
        tool_use_id: 'ws_1',
        content: [
          {
            type: 'web_search_result',
            url: 'https://developers.openai.com/api/docs/guides/tools-web-search',
            title: 'Web search | OpenAI API',
          },
        ],
      },
    });
  });

  it('closes a native web_fetch tool call with x_tool_result once the fetch result arrives', () => {
    const assembler = new OpenAIWireAssembler({
      model: FIXTURE_MODEL_ID,
      now: NOW,
      wireMode: 'legacy-web',
    });

    const completed = assembler.sseChunks({
      type: 'server-tool-result',
      toolUseId: 'wf_1',
      payload: {
        type: 'web_fetch_tool_result',
        tool_use_id: 'wf_1',
        content: { type: 'web_fetch_result', url: 'https://example.com/page' },
      },
    });

    expect((completed[0] as { choices: Array<{ delta: unknown }> }).choices[0]?.delta).toEqual({
      x_tool_result: {
        tool_call_id: 'wf_1',
        name: 'web_fetch',
        content: 'Fetched https://example.com/page',
        is_error: false,
      },
    });
  });

  it('closes a native web_fetch tool call as failed for a web_fetch_tool_result_error', () => {
    const assembler = new OpenAIWireAssembler({
      model: FIXTURE_MODEL_ID,
      now: NOW,
      wireMode: 'legacy-web',
    });

    const completed = assembler.sseChunks({
      type: 'server-tool-result',
      toolUseId: 'wf_2',
      payload: {
        type: 'web_fetch_tool_result',
        tool_use_id: 'wf_2',
        content: { type: 'web_fetch_tool_result_error', error_code: 'url_not_accessible' },
      },
    });

    expect((completed[0] as { choices: Array<{ delta: unknown }> }).choices[0]?.delta).toEqual({
      x_tool_result: {
        tool_call_id: 'wf_2',
        name: 'web_fetch',
        content: 'Web fetch failed: url_not_accessible',
        is_error: true,
      },
    });
  });

  it('streams reasoning as inline <thinking> tags in openai-passthrough mode, same shape as legacy-web', () => {
    const contents = (events: Record<string, unknown>[]): unknown[] =>
      events.map(
        (e) =>
          (e as { choices: Array<{ delta: { content?: unknown } }> }).choices[0]?.delta.content,
      );

    for (const wireMode of ['legacy-web', 'openai-passthrough'] as const) {
      const assembler = new OpenAIWireAssembler({ model: FIXTURE_MODEL_ID, now: NOW, wireMode });
      const opened = assembler.sseChunks({ type: 'thinking-delta', delta: 'weighing options' });
      const answered = assembler.sseChunks({ type: 'text-delta', delta: 'Answer.' });

      expect(contents(opened).slice(-2)).toEqual(['<thinking>', 'weighing options']);
      expect(contents(answered)).toEqual(['</thinking>', 'Answer.']);
      expect(assembler.canonicalText()).toBe('Answer.');
    }
  });

  it('emits nothing for a turn without reasoning, so no empty thinking block is fabricated', () => {
    const assembler = new OpenAIWireAssembler({
      model: FIXTURE_MODEL_ID,
      now: NOW,
      wireMode: 'openai-passthrough',
    });
    const events = assembler.sseChunks({ type: 'text-delta', delta: 'Direct.' });
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain('<thinking>');
    expect(serialized).not.toContain('reasoning_content');
  });
});

describe('assembleOpenAIWireResponse (non-streaming)', () => {
  it('assembles text, tool calls, usage, and finish reason', () => {
    const chunks: StreamChunk[] = [
      { type: 'text-delta', delta: 'Hello ' },
      { type: 'text-delta', delta: 'world' },
      { type: 'tool-use-start', toolUseId: 'tu_9', name: 'lookup' },
      { type: 'tool-use-delta', toolUseId: 'tu_9', deltaJson: '{"id":1}' },
      { type: 'tool-use-end', toolUseId: 'tu_9' },
      { type: 'usage', inputTokens: 12, outputTokens: 7 },
      { type: 'stop', reason: 'tool_use' },
    ];

    const response = assembleOpenAIWireResponse(chunks, {
      model: FIXTURE_MODEL_ID,
      now: NOW,
      id: 'chatcmpl-y',
    });

    expect(response).toEqual({
      id: 'chatcmpl-y',
      object: 'chat.completion',
      created: Math.floor(NOW() / 1000),
      model: FIXTURE_MODEL_ID,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'Hello world',
            tool_calls: [
              {
                id: 'tu_9',
                type: 'function',
                index: 0,
                function: { name: 'lookup', arguments: '{"id":1}' },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
      usage: { prompt_tokens: 12, completion_tokens: 7, total_tokens: 19 },
    });
  });

  it('null content when only tool calls, records error as stop', () => {
    const assembler = new OpenAIWireAssembler({ model: FIXTURE_MODEL_ID, now: NOW });
    assembler.ingest({ type: 'error', message: 'boom' });
    expect(assembler.lastError).toBe('boom');
    const response = assembler.response();
    expect((response['choices'] as Array<{ finish_reason: string }>)[0]?.finish_reason).toBe(
      'stop',
    );
    expect(
      (response['choices'] as Array<{ message: { content: null } }>)[0]?.message.content,
    ).toBeNull();
  });

  it('carries google grounding sources into search_results, same as native web_search_tool_result', () => {
    const chunks: StreamChunk[] = [
      { type: 'text-delta', delta: 'Grounded answer.' },
      {
        type: 'server-tool-result',
        toolUseId: 'gemini-grounding-1',
        payload: {
          type: 'gemini_grounding_result',
          results: [
            { type: 'web_search_result', url: 'https://example.com/a', title: 'A', position: 1 },
          ],
        },
      },
      { type: 'stop', reason: 'end_turn' },
    ];

    const response = assembleOpenAIWireResponse(chunks, {
      model: FIXTURE_MODEL_ID,
      now: NOW,
      id: 'chatcmpl-grounding',
      wireMode: 'legacy-web',
    });

    expect(response['search_results']).toEqual([
      {
        content: [
          { type: 'web_search_result', url: 'https://example.com/a', title: 'A', position: 1 },
        ],
      },
    ]);
  });

  it('omits search_results when no grounding or web_search_tool_result payload was ingested', () => {
    const response = assembleOpenAIWireResponse(
      [
        { type: 'text-delta', delta: 'No search here.' },
        { type: 'stop', reason: 'end_turn' },
      ],
      { model: FIXTURE_MODEL_ID, now: NOW, id: 'chatcmpl-no-search', wireMode: 'legacy-web' },
    );

    expect(response['search_results']).toBeUndefined();
  });
});

describe('OpenAIWireAssembler mid-stream error signaling (x_stream_error)', () => {
  const midStreamFailure: StreamChunk[] = [
    { type: 'text-delta', delta: 'partial answer' },
    { type: 'error', message: 'Anthropic API overloaded', code: '529', retryable: true },
    { type: 'stop', reason: 'error' },
  ];

  function extractErrorMarkers(wire: Record<string, unknown>[]): unknown[] {
    return wire
      .map(
        (e) =>
          (e as { choices?: Array<{ delta?: { x_stream_error?: unknown } }> }).choices?.[0]?.delta
            ?.x_stream_error,
      )
      .filter((m): m is Record<string, unknown> => m !== undefined && m !== null);
  }

  it("legacy-web: emits x_stream_error as {message,code,retryable} and a literal finish_reason:'error' (both wire-mode-agnostic AND legacy-web-specific signals present)", () => {
    const assembler = new OpenAIWireAssembler({
      model: FIXTURE_MODEL_ID,
      wireMode: 'legacy-web',
      now: NOW,
    });
    const wire: Record<string, unknown>[] = [];
    for (const chunk of midStreamFailure) wire.push(...assembler.sseChunks(chunk));

    expect(assembler.lastError).toBe('Anthropic API overloaded');

    const errorMarkers = extractErrorMarkers(wire);
    expect(errorMarkers).toEqual([
      { message: 'Anthropic API overloaded', code: '529', retryable: true },
    ]);

    const finishReasons = wire
      .map(
        (e) => (e as { choices?: Array<{ finish_reason?: unknown }> }).choices?.[0]?.finish_reason,
      )
      .filter((f): f is string => typeof f === 'string');
    expect(finishReasons.at(-1)).toBe('error');
  });

  it('legacy-web: omits code/retryable from the payload when the provider adapter did not supply them', () => {
    const assembler = new OpenAIWireAssembler({
      model: FIXTURE_MODEL_ID,
      wireMode: 'legacy-web',
      now: NOW,
    });
    const wire: Record<string, unknown>[] = [];
    for (const chunk of [
      { type: 'error' as const, message: 'connection reset' },
      { type: 'stop' as const, reason: 'error' as const },
    ]) {
      wire.push(...assembler.sseChunks(chunk));
    }
    const errorMarkers = extractErrorMarkers(wire);
    expect(errorMarkers).toEqual([{ message: 'connection reset' }]);
  });

  it('openai-passthrough: emits x_stream_error as {message,code,retryable} but NEVER an out-of-spec finish_reason (real-OpenAI byte-compat preserved)', () => {
    const assembler = new OpenAIWireAssembler({
      model: FIXTURE_MODEL_ID,
      wireMode: 'openai-passthrough',
      now: NOW,
    });
    const wire: Record<string, unknown>[] = [];
    for (const chunk of midStreamFailure) wire.push(...assembler.sseChunks(chunk));

    expect(assembler.lastError).toBe('Anthropic API overloaded');

    const errorMarkers = extractErrorMarkers(wire);
    expect(errorMarkers).toEqual([
      { message: 'Anthropic API overloaded', code: '529', retryable: true },
    ]);

    const finishReasons = wire
      .map(
        (e) => (e as { choices?: Array<{ finish_reason?: unknown }> }).choices?.[0]?.finish_reason,
      )
      .filter((f): f is string => typeof f === 'string');
    expect(finishReasons.every((f) => f === 'stop')).toBe(true);
  });

  it('default mode: sseChunk() (singular, services/api-gateway) is UNCHANGED — no x_stream_error, matching its documented no-new-output contract for extension chunk types', () => {
    const assembler = new OpenAIWireAssembler({ model: FIXTURE_MODEL_ID, now: NOW });
    assembler.ingest({ type: 'text-delta', delta: 'partial' });
    const chunk = assembler.sseChunk({ type: 'error', message: 'boom' });
    expect(chunk).toEqual({
      id: expect.any(String),
      object: 'chat.completion.chunk',
      created: expect.any(Number),
      model: FIXTURE_MODEL_ID,
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    });
  });
});

describe('OpenAIWireAssembler safety refusal (first-class StreamChunkStop refusal member)', () => {
  it("default mode: a 'refusal' stop reaches the wire as finish_reason 'content_filter' — the OpenAI wire's own safety vocabulary, never a normal 'stop'", () => {
    const assembler = new OpenAIWireAssembler({ model: FIXTURE_MODEL_ID, now: NOW });
    const chunk = assembler.sseChunk({ type: 'stop', reason: 'refusal' });
    expect(
      (chunk as { choices: Array<{ finish_reason?: string }> }).choices[0]!.finish_reason,
    ).toBe('content_filter');
  });

  it("legacy-web mode: a 'refusal' stop emits the literal finish_reason 'refusal' (the legacy wire's literal-passthrough rule), never 'error' and never 'stop'", () => {
    const assembler = new OpenAIWireAssembler({
      model: FIXTURE_MODEL_ID,
      wireMode: 'legacy-web',
      now: NOW,
    });
    const wire: Record<string, unknown>[] = [];
    for (const c of assembler.sseChunks({ type: 'stop', reason: 'refusal' })) wire.push(c);
    const finishReasons = wire
      .map(
        (e) => (e as { choices?: Array<{ finish_reason?: unknown }> }).choices?.[0]?.finish_reason,
      )
      .filter((f): f is string => typeof f === 'string');
    expect(finishReasons).toEqual(['refusal']);
  });
});

describe('OpenAIWireAssembler paused turn (StreamChunkStop pause_turn member)', () => {
  it("default mode: a 'pause_turn' stop reaches the wire as the continuable finish_reason 'length', never a normal 'stop'", () => {
    const assembler = new OpenAIWireAssembler({ model: FIXTURE_MODEL_ID, now: NOW });
    const chunk = assembler.sseChunk({ type: 'stop', reason: 'pause_turn' });
    expect(
      (chunk as { choices: Array<{ finish_reason?: string }> }).choices[0]!.finish_reason,
    ).toBe('length');
  });

  it("legacy-web mode: a 'pause_turn' stop emits the literal finish_reason 'pause_turn', which the client treats as continuable", () => {
    const assembler = new OpenAIWireAssembler({
      model: FIXTURE_MODEL_ID,
      wireMode: 'legacy-web',
      now: NOW,
    });
    const wire: Record<string, unknown>[] = [];
    for (const c of assembler.sseChunks({ type: 'stop', reason: 'pause_turn' })) wire.push(c);
    const finishReasons = wire
      .map(
        (e) => (e as { choices?: Array<{ finish_reason?: unknown }> }).choices?.[0]?.finish_reason,
      )
      .filter((f): f is string => typeof f === 'string');
    expect(finishReasons).toEqual(['pause_turn']);
  });
});

describe('OpenAIWireAssembler canonical thinking capture (legacy-web)', () => {
  const thinkingThenToolUse: StreamChunk[] = [
    { type: 'thinking-delta', delta: 'Let me ' },
    { type: 'thinking-delta', delta: 'check the time.' },
    { type: 'thinking-delta', delta: '', signature: 'sig-abc123' },
    { type: 'text-delta', delta: 'Checking now.' },
    { type: 'tool-use-start', toolUseId: 'call_1', name: 'get_time', vendorIndex: 1 },
    { type: 'tool-use-delta', toolUseId: 'call_1', deltaJson: '{}' },
    { type: 'tool-use-end', toolUseId: 'call_1' },
    { type: 'stop', reason: 'tool_use' },
  ];

  it('reconstructs signed thinking blocks and tag-free text without altering the wire', () => {
    const assembler = new OpenAIWireAssembler({
      model: FIXTURE_MODEL_ID,
      wireMode: 'legacy-web',
      now: NOW,
    });
    const wire: Record<string, unknown>[] = [];
    for (const chunk of thinkingThenToolUse) wire.push(...assembler.sseChunks(chunk));

    expect(assembler.canonicalThinkingBlocks()).toEqual([
      { type: 'thinking', thinking: 'Let me check the time.', signature: 'sig-abc123' },
    ]);
    expect(assembler.canonicalText()).toBe('Checking now.');

    const contents = wire
      .map(
        (e) =>
          (e as { choices?: Array<{ delta?: { content?: string } }> }).choices?.[0]?.delta?.content,
      )
      .filter((c): c is string => typeof c === 'string');
    expect(contents).toEqual([
      '<thinking>',
      'Let me ',
      'check the time.',
      '',
      '</thinking>',
      'Checking now.',
    ]);
    expect(JSON.stringify(wire)).not.toContain('sig-abc123');
  });

  it('captures multiple signed thinking blocks, delimited by their signatures', () => {
    const assembler = new OpenAIWireAssembler({
      model: FIXTURE_MODEL_ID,
      wireMode: 'legacy-web',
      now: NOW,
    });
    const chunks: StreamChunk[] = [
      { type: 'thinking-delta', delta: 'first' },
      { type: 'thinking-delta', delta: '', signature: 'sig-1' },
      { type: 'thinking-delta', delta: 'second' },
      { type: 'thinking-delta', delta: '', signature: 'sig-2' },
      { type: 'stop', reason: 'tool_use' },
    ];
    for (const chunk of chunks) assembler.ingest(chunk);
    expect(assembler.canonicalThinkingBlocks()).toEqual([
      { type: 'thinking', thinking: 'first', signature: 'sig-1' },
      { type: 'thinking', thinking: 'second', signature: 'sig-2' },
    ]);
  });

  it('omits a dangling unsigned thinking block (only signed blocks round-trip)', () => {
    const assembler = new OpenAIWireAssembler({
      model: FIXTURE_MODEL_ID,
      wireMode: 'legacy-web',
      now: NOW,
    });
    assembler.ingest({ type: 'thinking-delta', delta: 'no signature here' });
    assembler.ingest({ type: 'stop', reason: 'end_turn' });
    expect(assembler.canonicalThinkingBlocks()).toEqual([]);
  });

  it('captures nothing for a non-thinking stream (behavior-identical path)', () => {
    const assembler = new OpenAIWireAssembler({
      model: FIXTURE_MODEL_ID,
      wireMode: 'openai-passthrough',
      now: NOW,
    });
    assembler.ingest({ type: 'text-delta', delta: 'hello' });
    assembler.ingest({ type: 'stop', reason: 'end_turn' });
    expect(assembler.canonicalThinkingBlocks()).toEqual([]);
    expect(assembler.canonicalText()).toBe('hello');
  });
});

describe('openAIWireRequestToChatRequest __canonicalThinking reconstruction', () => {
  it('prepends signed ThinkingBlocks before text and tool_use on the assistant turn', () => {
    const req = openAIWireRequestToChatRequest({
      model: FIXTURE_MODEL_ID,
      messages: [
        { role: 'user', content: 'what time is it?' },
        {
          role: 'assistant',
          content: 'Checking now.',
          tool_calls: [
            { id: 'call_1', type: 'function', function: { name: 'get_time', arguments: '{}' } },
          ],
          __canonicalThinking: [
            { type: 'thinking', thinking: 'Let me check the time.', signature: 'sig-abc123' },
          ],
        },
        { role: 'tool', tool_call_id: 'call_1', content: '12:00' },
      ],
    });

    const assistant = req.messages.find((m) => m.role === 'assistant');
    expect(assistant?.content).toEqual([
      { type: 'thinking', thinking: 'Let me check the time.', signature: 'sig-abc123' },
      { type: 'text', text: 'Checking now.' },
      { type: 'tool_use', id: 'call_1', name: 'get_time', input: {} },
    ]);
  });

  it('drops unsigned thinking blocks (an unsigned block would be rejected by Anthropic)', () => {
    const req = openAIWireRequestToChatRequest({
      model: FIXTURE_MODEL_ID,
      messages: [
        {
          role: 'assistant',
          content: 'hi',
          tool_calls: [{ id: 'c1', type: 'function', function: { name: 'f', arguments: '{}' } }],
          __canonicalThinking: [{ type: 'thinking', thinking: 'unsigned' }],
        },
      ],
    });
    const assistant = req.messages.find((m) => m.role === 'assistant');
    expect(assistant?.content).toEqual([
      { type: 'text', text: 'hi' },
      { type: 'tool_use', id: 'c1', name: 'f', input: {} },
    ]);
  });

  it('is unchanged for an assistant message without __canonicalThinking', () => {
    const req = openAIWireRequestToChatRequest({
      model: FIXTURE_MODEL_ID,
      messages: [
        {
          role: 'assistant',
          content: 'hi',
          tool_calls: [{ id: 'c1', type: 'function', function: { name: 'f', arguments: '{}' } }],
        },
      ],
    });
    const assistant = req.messages.find((m) => m.role === 'assistant');
    expect(assistant?.content).toEqual([
      { type: 'text', text: 'hi' },
      { type: 'tool_use', id: 'c1', name: 'f', input: {} },
    ]);
  });
});
