import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMapSearchToolDefinition } from '@/lib/services/map-search-tool-service';
import { webSearchToolDef } from '@/lib/web-search/web-search-tool';
import type { WebMcpToolDef } from '@/lib/mcp-tool-executor';

const provider = vi.hoisted(() => ({ stream: vi.fn() }));
vi.mock('./tool-loop-anthropic', () => ({
  buildToolLoopStream: provider.stream,
  buildServingRouteId: (...args: unknown[]) => args.join(':'),
}));
vi.mock('@/lib/e2b/runtime', () => ({
  getE2BExecutor: vi.fn().mockResolvedValue(null),
  pauseE2BSession: vi.fn().mockResolvedValue(undefined),
}));

import { runToolLoop } from './tool-loop';
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

  it('still asks for a read tool that can move data out of the trust boundary', async () => {
    provider.stream.mockResolvedValueOnce(toolCallStream('web_search', { query: 'austin coffee' }));

    const output = await collect(
      runToolLoop(makeProcessed(), {
        approvalMode: 'manual',
        mcpTools: [CONNECTOR_TOOL],
        toolApprovalPolicy: 'auto_approve_read_only',
      }),
    );

    expect(output).toContain('x_tool_approval_request');
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
          size: 1,
        },
      }),
    );

    expect(output).toContain('x_tool_approval_request');
    expect(output).not.toContain('map-search.v1');
  });
});
