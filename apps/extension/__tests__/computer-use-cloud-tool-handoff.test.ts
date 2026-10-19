import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { OpenAIWireAssembler } from '@agiworkforce/provider-protocol';
import {
  callCloud,
  CloudAgentGatewayError,
  COMPUTER_USE_MODEL,
  DEFAULT_GATEWAY_BASE,
  type ToolCall,
} from '../src/features/computer-use/cloudAgentClient';

const read: ToolCall = {
  id: 'call-read',
  type: 'function',
  function: { name: 'read_dom', arguments: '{}' },
};
const click: ToolCall = {
  id: 'call-click',
  type: 'function',
  function: { name: 'click', arguments: '{"index":3}' },
};

const serverSource = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '../../web/app/api/llm/v1/chat/completions/lib/tool-loop.ts',
  ),
  'utf8',
);
const program = ts.createSourceFile('tool-loop.ts', serverSource, ts.ScriptTarget.Latest, true);
const handoffProducer = program.statements.find(
  (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'toolHandoffEvent',
);
if (!handoffProducer) throw new Error('The canonical tool handoff producer is missing.');
const compiled = ts.transpileModule(`return ${handoffProducer.getText(program)};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None },
});
// llm-guardrail-allow: executes repository-owned browser code inside this isolated test fixture.
const emitHandoff = new Function('sseData', compiled.outputText)((payload: unknown) => payload) as (
  calls: readonly { id: string; qualifiedName: string; args: Record<string, unknown> }[],
  model: string,
) => unknown;

function toolDelta(calls: unknown[], finishReason: string | null = null): unknown {
  return { choices: [{ index: 0, delta: { tool_calls: calls }, finish_reason: finishReason }] };
}

function handoff(calls: readonly ToolCall[]): unknown {
  return emitHandoff(
    calls.map((call) => ({
      id: call.id,
      qualifiedName: call.function.name,
      args: JSON.parse(call.function.arguments) as Record<string, unknown>,
    })),
    COMPUTER_USE_MODEL,
  );
}

function body(frames: unknown[], width: number): Response {
  const bytes = new TextEncoder().encode(
    frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join('') + 'data: [DONE]\n\n',
  );
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (let offset = 0; offset < bytes.length; offset += width)
          controller.enqueue(bytes.slice(offset, offset + width));
        controller.close();
      },
    }),
    { status: 200 },
  );
}

async function response(frames: unknown[], width = 7) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => body(frames, width)),
  );
  return callCloud([], 'test-token', DEFAULT_GATEWAY_BASE);
}

afterEach(() => vi.unstubAllGlobals());

describe('canonical caller-owned browser tool handoff', () => {
  it('densifies actual legacy-web producer calls whose Anthropic content-block index starts at two', async () => {
    const assembler = new OpenAIWireAssembler({
      model: COMPUTER_USE_MODEL,
      wireMode: 'legacy-web',
    });
    const frames = [
      ...assembler.sseChunks({
        type: 'tool-use-start',
        toolUseId: read.id,
        name: read.function.name,
        vendorIndex: 2,
      }),
      ...assembler.sseChunks({ type: 'tool-use-delta', toolUseId: read.id, deltaJson: '{}' }),
      ...assembler.sseChunks({ type: 'stop', reason: 'tool_use' }),
    ];
    expect(JSON.stringify(frames)).toContain('"index":2');
    const result = await response(frames, 1);
    expect(result.message.tool_calls).toEqual([read]);
    expect(result.message.tool_calls).toHaveLength(1);
    expect(result.message.tool_calls?.every((call) => call !== undefined)).toBe(true);
  });

  it('reads a no-input tool streamed with empty arguments as an empty object', async () => {
    const assembler = new OpenAIWireAssembler({
      model: COMPUTER_USE_MODEL,
      wireMode: 'legacy-web',
    });
    const result = await response(
      [
        ...assembler.sseChunks({
          type: 'tool-use-start',
          toolUseId: click.id,
          name: click.function.name,
          vendorIndex: 1,
        }),
        ...assembler.sseChunks({
          type: 'tool-use-delta',
          toolUseId: click.id,
          deltaJson: '{"index":3}',
        }),
        ...assembler.sseChunks({
          type: 'tool-use-start',
          toolUseId: read.id,
          name: read.function.name,
          vendorIndex: 2,
        }),
        ...assembler.sseChunks({ type: 'stop', reason: 'tool_use' }),
      ],
      1,
    );
    expect(result.message.tool_calls).toEqual([click, read]);
  });

  it('keeps parallel calls keyed by their actual noncontiguous producer indices', async () => {
    const assembler = new OpenAIWireAssembler({
      model: COMPUTER_USE_MODEL,
      wireMode: 'legacy-web',
    });
    const result = await response(
      [
        ...assembler.sseChunks({
          type: 'tool-use-start',
          toolUseId: click.id,
          name: click.function.name,
          vendorIndex: 5,
        }),
        ...assembler.sseChunks({
          type: 'tool-use-start',
          toolUseId: read.id,
          name: read.function.name,
          vendorIndex: 2,
        }),
        ...assembler.sseChunks({
          type: 'tool-use-delta',
          toolUseId: click.id,
          deltaJson: '{"index":',
        }),
        ...assembler.sseChunks({ type: 'tool-use-delta', toolUseId: read.id, deltaJson: '{}' }),
        ...assembler.sseChunks({ type: 'tool-use-delta', toolUseId: click.id, deltaJson: '3}' }),
        ...assembler.sseChunks({ type: 'stop', reason: 'tool_use' }),
      ],
      1,
    );
    expect(result.message.tool_calls).toEqual([read, click]);
  });

  it.each([
    null,
    { ...read },
    { index: -1, ...read },
    { index: 0.5, ...read },
    { index: Number.MAX_SAFE_INTEGER + 1, ...read },
    { index: 2, ...read, type: 'arbitrary' },
    { index: 2, ...read, id: 7 },
    { index: 2, ...read, function: [] },
    { index: 2, ...read, function: { name: 'read_dom', arguments: 4 } },
  ])('fails closed on malformed raw fragments without defaulting an index: %j', async (part) => {
    await expect(response([toolDelta([part], 'tool_calls')])).rejects.toMatchObject({
      name: 'CloudAgentGatewayError',
      code: 'protocol_error',
    });
  });

  it.each([
    { calls: [{ index: 2, type: 'function', function: { name: 'read_dom', arguments: '{}' } }] },
    { calls: [{ index: 2, ...read, function: { name: 'read_', arguments: '{}' } }] },
    { calls: [{ index: 2, ...read, function: { name: 'read_dom', arguments: '{' } }] },
    { calls: [{ index: 2, ...read, function: { name: 'read_dom', arguments: 'null' } }] },
    {
      calls: [
        { index: 2, ...read },
        { index: 5, ...click, id: read.id },
      ],
    },
  ])('validates complete raw calls before they can reach dispatch: %j', async ({ calls }) => {
    await expect(response([toolDelta(calls, 'tool_calls')])).rejects.toMatchObject({
      name: 'CloudAgentGatewayError',
      code: 'protocol_error',
    });
  });

  it('rejects a malformed raw tool call collection instead of dropping it', async () => {
    await expect(
      response([{ choices: [{ delta: { tool_calls: { index: 2, ...read } } }] }]),
    ).rejects.toMatchObject({ code: 'protocol_error' });
  });

  it.each([1, 7, 4096])(
    'replaces provider deltas with the complete handoff across %i-byte reads',
    async (width) => {
      const result = await response(
        [
          toolDelta([{ index: 0, ...read }], 'tool_calls'),
          handoff([read]),
          { choices: [], usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } },
        ],
        width,
      );
      expect(result.message.tool_calls).toEqual([read]);
      expect(result.tokensUsed).toBe(12);
      expect(result.isDone).toBe(true);
    },
  );

  it('preserves exact parallel IDs and full arguments after interleaved fragments', async () => {
    const result = await response(
      [
        toolDelta([
          {
            index: 1,
            id: 'call-',
            type: 'function',
            function: { name: 'cl', arguments: '{"index":' },
          },
        ]),
        toolDelta([
          { index: 0, id: 'call-', type: 'function', function: { name: 'read_', arguments: '{' } },
        ]),
        toolDelta(
          [
            { index: 1, id: 'click', function: { name: 'ick', arguments: '3}' } },
            { index: 0, id: 'read', function: { name: 'dom', arguments: '}' } },
          ],
          'tool_calls',
        ),
        handoff([read, click]),
      ],
      1,
    );
    expect(result.message.tool_calls).toEqual([read, click]);
  });

  it('keeps the unmarked OpenAI fragment stream ending in tool_calls and DONE', async () => {
    const result = await response([
      toolDelta([
        { index: 0, id: 'call-', type: 'function', function: { name: 'read_', arguments: '{' } },
      ]),
      toolDelta(
        [{ index: 0, id: 'read', function: { name: 'dom', arguments: '}' } }],
        'tool_calls',
      ),
    ]);
    expect(result.message.tool_calls).toEqual([read]);
  });

  it('discards raw server-owned calls when a later public answer ends in stop', async () => {
    const result = await response(
      [
        toolDelta([{ index: 0, ...read }], 'tool_calls'),
        { choices: [{ delta: { content: 'The upload is confirmed.' }, finish_reason: null }] },
        {
          choices: [{ delta: { content: ' Byte count: 5.' }, finish_reason: 'stop' }],
          usage: { total_tokens: 18 },
        },
      ],
      1,
    );
    expect(result.message.content).toBe('The upload is confirmed. Byte count: 5.');
    expect(result.message).not.toHaveProperty('tool_calls');
    expect(result.tokensUsed).toBe(18);
    expect(result.isDone).toBe(true);
  });

  it('discards earlier server calls even when the final stop frame has no delta', async () => {
    const result = await response([
      toolDelta([{ index: 0, ...read }], 'tool_calls'),
      { choices: [{ delta: { content: 'The upload is confirmed.' } }] },
      { choices: [{ finish_reason: 'stop' }] },
    ]);
    expect(result.message.content).toBe('The upload is confirmed.');
    expect(result.message).not.toHaveProperty('tool_calls');
  });

  it('retains the exact marked snapshot and reads later usage even across a stop frame', async () => {
    const result = await response([
      handoff([read]),
      { choices: [{ delta: {}, finish_reason: 'stop' }] },
      { choices: [], usage: { total_tokens: 29 } },
    ]);
    expect(result.message.tool_calls).toEqual([read]);
    expect(result.tokensUsed).toBe(29);
  });

  it('still rejects a server error after a marked handoff and a terminal-looking stop', async () => {
    await expect(
      response([
        handoff([read]),
        { choices: [{ delta: {}, finish_reason: 'stop' }] },
        {
          choices: [
            {
              delta: {
                x_stream_error: {
                  message: 'The provider is unavailable.',
                  code: 'provider_unavailable',
                },
              },
            },
          ],
        },
      ]),
    ).rejects.toMatchObject({
      name: 'CloudAgentGatewayError',
      message: 'The provider is unavailable.',
      code: 'provider_unavailable',
    });
  });

  it('accepts an identical repeated complete handoff without duplication', async () => {
    const result = await response([handoff([read, click]), handoff([read, click])]);
    expect(result.message.tool_calls).toEqual([read, click]);
  });

  it('refuses conflicting complete handoffs instead of mixing approved actions', async () => {
    await expect(response([handoff([read]), handoff([click])])).rejects.toMatchObject({
      code: 'protocol_error',
    });
  });

  it('refuses unmarked tool fragments after the complete handoff', async () => {
    await expect(
      response([handoff([read]), toolDelta([{ index: 0, function: { name: 'click' } }])]),
    ).rejects.toMatchObject({ code: 'protocol_error' });
  });

  it.each([
    { marker: null, calls: [{ index: 0, ...read }] },
    { marker: {}, calls: [{ index: 0, ...read }] },
    { marker: { tool_call_ids: [] }, calls: [] },
    { marker: { tool_call_ids: ['another-id'] }, calls: [{ index: 0, ...read }] },
    {
      marker: { tool_call_ids: [read.id, read.id] },
      calls: [
        { index: 0, ...read },
        { index: 1, ...read },
      ],
    },
    { marker: { tool_call_ids: [read.id] }, calls: [{ index: -1, ...read }] },
    { marker: { tool_call_ids: [read.id] }, calls: [{ index: 1_000_000_000, ...read }] },
    { marker: { tool_call_ids: [read.id] }, calls: [{ index: 0.5, ...read }] },
    { marker: { tool_call_ids: [read.id] }, calls: [{ index: 0, ...read, type: 'arbitrary' }] },
    {
      marker: { tool_call_ids: [read.id] },
      calls: [{ index: 0, ...read, function: { name: 'unoffered_tool', arguments: '{}' } }],
    },
    {
      marker: { tool_call_ids: [read.id] },
      calls: [{ index: 0, ...read, function: { name: 'read_dom', arguments: '{' } }],
    },
    {
      marker: { tool_call_ids: [read.id] },
      calls: [{ index: 0, ...read, function: { name: 'read_dom', arguments: '[]' } }],
    },
    { marker: { tool_call_ids: [read.id] }, calls: undefined },
  ])('rejects an unknown or malformed handoff before dispatch: %j', async ({ marker, calls }) => {
    await expect(
      response(
        [
          toolDelta([{ index: 0, ...read }]),
          {
            choices: [
              {
                index: 0,
                finish_reason: 'tool_calls',
                delta: {
                  tool_calls: calls,
                  x_tool_handoff: marker,
                },
              },
            ],
          },
        ],
        1,
      ),
    ).rejects.toBeInstanceOf(CloudAgentGatewayError);
  });

  it('requires the canonical tool_calls finish for the handoff marker', async () => {
    await expect(
      response([
        {
          choices: [
            {
              finish_reason: 'stop',
              delta: {
                tool_calls: [{ index: 0, ...read }],
                x_tool_handoff: { tool_call_ids: [read.id] },
              },
            },
          ],
        },
      ]),
    ).rejects.toMatchObject({ code: 'protocol_error' });
  });
});
