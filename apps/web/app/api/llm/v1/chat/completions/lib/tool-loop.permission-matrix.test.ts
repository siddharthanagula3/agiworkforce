import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMapSearchToolDefinition } from '@/lib/services/map-search-tool-service';
import { webSearchToolDef } from '@/lib/web-search/web-search-tool';
import {
  TOOL_APPROVAL_POLICIES,
  resolveEffectiveToolApprovalPolicy,
  type ToolApprovalPolicy,
} from '@shared/types/toolApprovalPolicy';
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
import { classifyToolLoopInputs } from './tool-loop-routing';
import type { ProcessedRequest } from './request-processor';

const CONNECTOR_TOOL: WebMcpToolDef = {
  qualifiedName: 'mcp__fixtureserver__mutate_fixture_record',
  serverId: 'fixtureserver',
  toolName: 'mutate_fixture_record',
  description: 'Fixture connector tool with no declared metadata',
  origin: 'connector',
  inputSchema: { type: 'object', properties: {} },
};

// One tool per action class the metadata model distinguishes: an observation, a
// reversible write, and a write the product cannot undo.
const TOOL_BY_CLASS = {
  'read-only': { name: 'search_maps', args: { query: 'coffee in Austin', title: 'Coffee' } },
  mutating: { name: 'create_folder', args: { path: 'notes' } },
  destructive: { name: 'write_file', args: { path: 'notes/plan.md', content: 'x' } },
} as const;

type ToolClass = keyof typeof TOOL_BY_CLASS;

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
                id: 'fixture-matrix-call',
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

function makeProcessed(): ProcessedRequest {
  return {
    chatSurface: 'web' as const,
    requestId: 'fixture-matrix-request',
    chatRequest: {
      model: 'fixture-model',
      messages: [{ role: 'user', content: 'Do the thing.' }],
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
      messages: [{ role: 'user', content: 'Do the thing.' }],
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

async function asksForApproval(policy: ToolApprovalPolicy, toolClass: ToolClass): Promise<boolean> {
  const tool = TOOL_BY_CLASS[toolClass];
  provider.stream.mockResolvedValueOnce(toolCallStream(tool.name, tool.args));
  const output = await collect(
    runToolLoop(makeProcessed(), {
      approvalMode: 'manual',
      mcpTools: [CONNECTOR_TOOL],
      toolApprovalPolicy: policy,
    }),
  );
  return output.includes('x_tool_approval_request');
}

/**
 * Stored choice and workspace permission in, approval question out. `autonomous`
 * is the only row the workspace can move, and it moves to the fail-closed
 * default rather than to the read-only policy.
 */
const EXPECTED: Record<
  ToolApprovalPolicy,
  Record<'permitted' | 'forbidden', Record<ToolClass, boolean>>
> = {
  ask_every_time: {
    permitted: { 'read-only': true, mutating: true, destructive: true },
    forbidden: { 'read-only': true, mutating: true, destructive: true },
  },
  auto_approve_read_only: {
    permitted: { 'read-only': false, mutating: true, destructive: true },
    forbidden: { 'read-only': false, mutating: true, destructive: true },
  },
  autonomous: {
    permitted: { 'read-only': false, mutating: false, destructive: true },
    forbidden: { 'read-only': true, mutating: true, destructive: true },
  },
};

describe('tool approval permission matrix', () => {
  beforeEach(() => provider.stream.mockReset());

  for (const stored of TOOL_APPROVAL_POLICIES) {
    for (const organization of ['permitted', 'forbidden'] as const) {
      for (const toolClass of Object.keys(TOOL_BY_CLASS) as ToolClass[]) {
        const expected = EXPECTED[stored][organization][toolClass];
        it(`${stored} + workspace ${organization} + ${toolClass} tool ${
          expected ? 'asks' : 'runs unattended'
        }`, async () => {
          const effective = resolveEffectiveToolApprovalPolicy(stored, {
            organizationPermitsAutonomous: organization === 'permitted',
          });
          expect(await asksForApproval(effective, toolClass)).toBe(expected);
        });
      }
    }
  }

  it('still asks for an undeclared connector tool under every policy', async () => {
    for (const policy of TOOL_APPROVAL_POLICIES) {
      provider.stream.mockResolvedValueOnce(
        toolCallStream(CONNECTOR_TOOL.qualifiedName, { id: 'fixture' }),
      );
      const output = await collect(
        runToolLoop(makeProcessed(), {
          approvalMode: 'manual',
          mcpTools: [CONNECTOR_TOOL],
          toolApprovalPolicy: policy,
        }),
      );
      expect(output, policy).toContain('x_tool_approval_request');
    }
  });

  it('keeps a per-tool Deny ahead of the autonomous policy', async () => {
    provider.stream.mockResolvedValueOnce(
      toolCallStream(TOOL_BY_CLASS['read-only'].name, TOOL_BY_CLASS['read-only'].args),
    );
    const output = await collect(
      runToolLoop(makeProcessed(), {
        approvalMode: 'manual',
        mcpTools: [CONNECTOR_TOOL],
        toolApprovalPolicy: 'autonomous',
        connectorPermissions: {
          entries: [],
          levelFor: (qualifiedName: string) =>
            qualifiedName === 'search_maps' ? 'deny' : undefined,
          levelForConnectorTool: () => undefined,
          isDenied: (qualifiedName: string) => qualifiedName === 'search_maps',
          isConnectorToolDenied: () => false,
          size: 1,
        },
      }),
    );

    expect(output).not.toContain('map-search.v1');
  });

  it('keeps the loop in manual mode when a destructive tool is offered under autonomous', () => {
    expect(
      classifyToolLoopInputs([], [{ function: { name: 'write_file' } }], 'autonomous').approvalMode,
    ).toBe('manual');
    expect(
      classifyToolLoopInputs([], [{ function: { name: 'web_search' } }], 'autonomous').approvalMode,
    ).toBe('auto');
  });
});
