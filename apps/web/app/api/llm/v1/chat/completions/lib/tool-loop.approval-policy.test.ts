import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMapSearchToolDefinition } from '@/lib/services/map-search-tool-service';
import { webSearchToolDef } from '@/lib/web-search/web-search-tool';
import type { WebMcpToolDef } from '@/lib/mcp-tool-executor';
import { e2bExecutionToolDefs } from '@/lib/e2b/execution-tools';
import { getE2BExecutor } from '@/lib/e2b/runtime';

const provider = vi.hoisted(() => ({ stream: vi.fn() }));
vi.mock('./tool-loop-anthropic', () => ({
  buildToolLoopStream: provider.stream,
  buildServingRouteId: (...args: unknown[]) => args.join(':'),
}));
vi.mock('@/lib/e2b/runtime', () => ({
  getE2BExecutor: vi.fn().mockResolvedValue(null),
  pauseE2BSession: vi.fn().mockResolvedValue(undefined),
}));

import { executeOfferedToolCall, runToolLoop, type ToolLoopApprovalCheckpoint } from './tool-loop';
import type { ProcessedRequest } from './request-processor';

const CONNECTOR_TOOL: WebMcpToolDef = {
  qualifiedName: 'mcp__fixtureserver__mutate_fixture_record',
  serverId: 'fixtureserver',
  toolName: 'mutate_fixture_record',
  description: 'Fixture connector tool with no declared metadata',
  origin: 'connector',
  inputSchema: { type: 'object', properties: {} },
};

function stream(events: unknown[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')),
      );
      controller.close();
    },
  });
}

function toolCallStream(name: string, args: Record<string, unknown>) {
  return stream([
    {
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'fixture-policy-call',
                type: 'function',
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
          index: 0,
        },
      ],
      model: 'fixture-model',
    },
    { choices: [{ delta: {}, finish_reason: 'tool_calls', index: 0 }], model: 'fixture-model' },
  ]);
}

function mapToolCallStream() {
  return toolCallStream('search_maps', {
    query: 'coffee shops near Austin, Texas',
    title: 'Coffee near Austin',
  });
}

function makeProcessed(): ProcessedRequest {
  return {
    chatSurface: 'web' as const,
    requestId: 'fixture-policy-request',
    chatRequest: {
      model: 'fixture-model',
      messages: [{ role: 'user', content: 'Show coffee shops on a map.' }],
      stream: true,
    },
    conversationId: undefined,
    requestedModel: 'fixture-model',
    provider: 'openai',
    estimatedCostCents: 0,
    estimatedPromptTokens: 0,
    maxTokens: 512,
    usedFallback: false,
    fallbackReason: undefined,
    originalModel: 'fixture-model',
    resolvedTaskType: 'general',
    classifierConfidence: 1,
    resolvedSlot: null,
    quotaFeature: 'chat',
    quotaWarningHeader: null,
    isFlagshipRequest: false,
    indicResult: undefined as never,
    llmRequest: {
      model: 'fixture-model',
      messages: [{ role: 'user', content: 'Show coffee shops on a map.' }],
      max_tokens: 512,
      stream: true,
      tools: [createMapSearchToolDefinition(), webSearchToolDef()],
    },
  } as ProcessedRequest;
}

async function collect(generator: AsyncGenerator<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let output = '';
  for await (const chunk of generator) output += decoder.decode(chunk);
  return output;
}

describe('account-wide default tool approval policy', () => {
  beforeEach(() => provider.stream.mockReset());

  it('rejects missing hosted write content before asking for approval or provisioning', async () => {
    const processed = makeProcessed();
    if (!processed.chatRequest) throw new Error('Missing request fixture');
    processed.chatRequest.code_execution = true;
    processed.llmRequest.tools = e2bExecutionToolDefs();
    const checkpoint = vi
      .fn<(value: ToolLoopApprovalCheckpoint) => Promise<void>>()
      .mockResolvedValue(undefined);
    vi.mocked(getE2BExecutor).mockClear();
    provider.stream
      .mockResolvedValueOnce(toolCallStream('write_file', { path: 'draft.txt' }))
      .mockResolvedValueOnce(
        stream([
          {
            choices: [
              {
                delta: { content: 'File contents are required.' },
                finish_reason: 'stop',
                index: 0,
              },
            ],
          },
        ]),
      );
    const output = await collect(
      runToolLoop(processed, {
        approvalMode: 'manual',
        mcpTools: [],
        toolApprovalPolicy: 'ask_every_time',
        onApprovalCheckpoint: checkpoint,
      }),
    );
    expect(output).toContain('missing required argument');
    expect(output).not.toContain('x_tool_approval_request');
    expect(checkpoint).not.toHaveBeenCalled();
    expect(getE2BExecutor).not.toHaveBeenCalled();
    expect(provider.stream).toHaveBeenCalledTimes(2);
    expect(output).not.toContain('x_stream_error');
    expect(provider.stream.mock.calls[1]?.[2]).toMatchObject({
      messages: expect.arrayContaining([
        expect.objectContaining({
          role: 'tool',
          tool_call_id: 'fixture-policy-call',
          content: expect.stringContaining('missing required argument'),
        }),
      ]),
    });
  });

  it('still asks before a valid explicitly empty hosted write', async () => {
    const processed = makeProcessed();
    if (!processed.chatRequest) throw new Error('Missing request fixture');
    processed.chatRequest.code_execution = true;
    processed.llmRequest.tools = e2bExecutionToolDefs();
    const checkpoint = vi
      .fn<(value: ToolLoopApprovalCheckpoint) => Promise<void>>()
      .mockResolvedValue(undefined);
    vi.mocked(getE2BExecutor).mockClear();
    provider.stream.mockResolvedValueOnce(
      toolCallStream('write_file', { path: 'draft.txt', content: '' }),
    );
    const output = await collect(
      runToolLoop(processed, {
        approvalMode: 'manual',
        mcpTools: [],
        toolApprovalPolicy: 'ask_every_time',
        onApprovalCheckpoint: checkpoint,
      }),
    );
    expect(output).toContain('x_tool_approval_request');
    expect(checkpoint).toHaveBeenCalledOnce();
    expect(checkpoint.mock.calls[0]?.[0].pendingToolCalls[0]?.args).toEqual({
      path: 'draft.txt',
      content: '',
    });
    expect(getE2BExecutor).not.toHaveBeenCalled();
  });

  it('rechecks hosted arguments from an already approved older checkpoint', async () => {
    const processed = makeProcessed();
    if (!processed.chatRequest) throw new Error('Missing request fixture');
    processed.chatRequest.code_execution = true;
    processed.llmRequest.tools = e2bExecutionToolDefs();
    processed.llmRequest.messages.push({
      role: 'assistant',
      content: '',
      tool_calls: [
        {
          id: 'older-invalid-write',
          type: 'function',
          function: { name: 'write_file', arguments: '{"path":"draft.txt"}' },
        },
      ],
    });
    vi.mocked(getE2BExecutor).mockClear();
    provider.stream.mockResolvedValueOnce(
      stream([
        {
          choices: [
            { delta: { content: 'Contents are required.' }, finish_reason: 'stop', index: 0 },
          ],
        },
      ]),
    );
    const output = await collect(
      runToolLoop(processed, {
        approvalMode: 'manual',
        mcpTools: [],
        toolApprovalPolicy: 'ask_every_time',
        resume: { approvals: [{ toolCallId: 'older-invalid-write', decision: 'approved' }] },
      }),
    );
    expect(output).toContain('missing required argument');
    expect(getE2BExecutor).not.toHaveBeenCalled();
    expect(output).not.toContain('x_stream_error');
  });

  it('keeps a colliding external schema from weakening hosted write requirements', async () => {
    vi.mocked(getE2BExecutor).mockClear();
    const result = await executeOfferedToolCall({
      call: {
        id: 'colliding-schema-write',
        qualifiedName: 'write_file',
        args: { path: 'draft.txt' },
      },
      offeredTools: new Set(['write_file']),
      mcpTools: [
        {
          qualifiedName: 'write_file',
          serverId: 'fixture',
          toolName: 'write_file',
          description: 'Reserved hosted-name fixture',
          origin: 'connector',
          inputSchema: {
            type: 'object',
            required: ['path'],
            properties: { path: { type: 'string' } },
          },
        },
      ],
      userId: 'user-1',
      organizationId: null,
      conversationId: null,
      model: 'fixture-model',
      requestId: 'collision-request',
      planTier: 'pro',
      surface: 'web',
    });
    expect(result).toMatchObject({
      isError: true,
      content: expect.stringContaining('missing required argument'),
    });
    expect(getE2BExecutor).not.toHaveBeenCalled();
  });

  it('asks for approval on a read-only tool when the account keeps the fail-closed default', async () => {
    provider.stream.mockResolvedValueOnce(mapToolCallStream());

    const output = await collect(
      runToolLoop(makeProcessed(), { approvalMode: 'manual', mcpTools: [CONNECTOR_TOOL] }),
    );

    expect(output).toContain('x_tool_approval_request');
    expect(output).not.toContain('map-search.v1');
  });

  it('runs a declared read-only tool without asking when the account opts into read-only auto-approval', async () => {
    provider.stream.mockResolvedValueOnce(mapToolCallStream());

    const output = await collect(
      runToolLoop(makeProcessed(), {
        approvalMode: 'manual',
        mcpTools: [CONNECTOR_TOOL],
        toolApprovalPolicy: 'auto_approve_read_only',
      }),
    );

    expect(output).not.toContain('x_tool_approval_request');
    expect(output).toContain('map-search.v1');
  });

  it('still asks for an undeclared connector tool under read-only auto-approval', async () => {
    provider.stream.mockResolvedValueOnce(
      toolCallStream(CONNECTOR_TOOL.qualifiedName, { id: 'fixture' }),
    );

    const output = await collect(
      runToolLoop(makeProcessed(), {
        approvalMode: 'manual',
        mcpTools: [CONNECTOR_TOOL],
        toolApprovalPolicy: 'auto_approve_read_only',
      }),
    );

    expect(output).toContain('x_tool_approval_request');
  });

  it('runs a web search without asking under the read-only policy', async () => {
    provider.stream.mockResolvedValueOnce(toolCallStream('web_search', { query: 'austin coffee' }));

    const output = await collect(
      runToolLoop(makeProcessed(), {
        approvalMode: 'manual',
        mcpTools: [CONNECTOR_TOOL],
        toolApprovalPolicy: 'auto_approve_read_only',
      }),
    );

    expect(output).not.toContain('x_tool_approval_request');
  });

  it('keeps a per-tool Ask verdict ahead of read-only auto-approval', async () => {
    provider.stream.mockResolvedValueOnce(mapToolCallStream());

    const output = await collect(
      runToolLoop(makeProcessed(), {
        approvalMode: 'manual',
        mcpTools: [CONNECTOR_TOOL],
        toolApprovalPolicy: 'auto_approve_read_only',
        connectorPermissions: {
          entries: [],
          levelFor: (qualifiedName: string) =>
            qualifiedName === 'search_maps' ? 'ask' : undefined,
          levelForConnectorTool: () => undefined,
          isDenied: () => false,
          isConnectorToolDenied: () => false,
          isConnectorDenied: () => false,
          size: 1,
        },
      }),
    );

    expect(output).toContain('x_tool_approval_request');
    expect(output).not.toContain('map-search.v1');
  });
});
