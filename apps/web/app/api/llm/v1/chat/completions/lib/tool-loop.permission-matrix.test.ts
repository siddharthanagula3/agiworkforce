import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMapSearchToolDefinition } from '@/lib/services/map-search-tool-service';
import { webSearchToolDef } from '@/lib/web-search/web-search-tool';
import {
  TOOL_APPROVAL_POLICIES,
  resolveEffectiveToolApprovalPolicy,
  type ToolApprovalPolicy,
} from '@shared/types/toolApprovalPolicy';
import { catalogToToolDefs, type WebMcpToolDef } from '@/lib/mcp-tool-executor';
import {
  connectorToolPermissionsFromEntries,
  withSessionGrants,
  type ConnectorToolPermissions,
} from './connector-tool-permissions';

const provider = vi.hoisted(() => ({ stream: vi.fn() }));
vi.mock('./tool-loop-anthropic', () => ({
  buildToolLoopStream: provider.stream,
  buildServingRouteId: (...args: unknown[]) => args.join(':'),
}));
vi.mock('@/lib/e2b/runtime', () => ({
  getE2BExecutor: vi.fn().mockResolvedValue(null),
  pauseE2BSession: vi.fn().mockResolvedValue(undefined),
}));

import { runToolLoop, type ToolLoopApprovalCheckpoint, type ToolLoopOptions } from './tool-loop';
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
          isConnectorDenied: () => false,
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

const DECLARED_READ: WebMcpToolDef = {
  qualifiedName: 'mcp__github__get_pull_request_diff',
  serverId: 'github',
  toolName: 'get_pull_request_diff',
  description: 'Declared read',
  origin: 'connector',
  inputSchema: { type: 'object', properties: {} },
};

async function approvalRequest(
  name: string,
  tools: WebMcpToolDef[],
  connectorPermissions?: ConnectorToolPermissions,
  sessionGrantRefusal?: ToolLoopOptions['sessionGrantRefusal'],
  runOptions: Partial<ToolLoopOptions> = {},
): Promise<{
  request: Record<string, unknown> | undefined;
  executions: number;
  output: string;
  checkpoint: ToolLoopApprovalCheckpoint | undefined;
}> {
  provider.stream.mockReset();
  provider.stream.mockResolvedValueOnce(toolCallStream(name, {}));
  provider.stream.mockResolvedValueOnce(
    stream([{ choices: [{ delta: {}, finish_reason: 'stop', index: 0 }], model: 'fixture-model' }]),
  );
  let checkpoint: ToolLoopApprovalCheckpoint | undefined;
  const connectorExecutor = vi.fn(async () => ({ handled: true, content: 'ok', isError: false }));
  const output = await collect(
    runToolLoop(makeProcessed(), {
      approvalMode: 'manual',
      mcpTools: tools,
      toolApprovalPolicy: 'ask_every_time',
      connectorExecutor,
      sessionGrantRefusal,
      onApprovalCheckpoint: async (value) => {
        checkpoint = value;
      },
      ...(connectorPermissions ? { connectorPermissions } : {}),
      ...runOptions,
    }),
  );
  for (const line of output.split('\n')) {
    if (!line.startsWith('data: {')) continue;
    const delta = (
      JSON.parse(line.slice('data: '.length)) as {
        choices?: Array<{ delta?: { x_tool_approval_request?: Record<string, unknown> } }>;
      }
    ).choices?.[0]?.delta?.x_tool_approval_request;
    if (delta)
      return {
        request: delta,
        executions: connectorExecutor.mock.calls.length,
        output,
        checkpoint,
      };
  }
  return {
    request: undefined,
    executions: connectorExecutor.mock.calls.length,
    output,
    checkpoint,
  };
}

const availablePermissions = {
  ...connectorToolPermissionsFromEntries([]),
  sessionGrantsAvailable: true,
};

describe('runToolLoop, approval review on x_tool_approval_request', () => {
  beforeEach(() => provider.stream.mockReset());

  it('offers every scope for an undeclared connector tool, which is high rather than critical', async () => {
    expect(
      (await approvalRequest(CONNECTOR_TOOL.qualifiedName, [CONNECTOR_TOOL], availablePermissions))
        .request,
    ).toMatchObject({
      risk_tier: 'high',
      destructive: true,
      approval_scopes: ['once', 'session', 'always'],
    });
  });

  it('carries a catalog destructiveHint to the approval as critical, with no standing allow', async () => {
    const [annotated] = catalogToToolDefs({
      version: 1,
      generatedAt: 0,
      servers: {},
      tools: [
        {
          serverName: 'fixtureserver',
          safeServerName: 'fixtureserver',
          toolName: 'purge_records',
          inputSchema: { type: 'object', properties: {} },
          annotations: { destructiveHint: true },
          visibility: 'both',
          fallbackDescription: 'Purges records',
        },
      ],
      resources: [],
      resourceTemplates: [],
      prompts: [],
      apps: [],
    });
    expect(annotated?.annotations).toEqual({ destructiveHint: true });
    expect(
      (
        await approvalRequest(
          annotated!.qualifiedName,
          [{ ...annotated!, origin: 'connector' }],
          availablePermissions,
        )
      ).request,
    ).toMatchObject({
      risk_tier: 'critical',
      destructive: true,
      approval_scopes: ['once', 'session'],
    });
  });

  it('asks for a critical tool every time even when an allow is saved for it', async () => {
    const critical = { ...CONNECTOR_TOOL, annotations: { destructiveHint: true } };
    const permissions = connectorToolPermissionsFromEntries([
      { connectorId: critical.serverId, toolName: critical.toolName, level: 'allow' },
    ]);
    const criticalResult = await approvalRequest(critical.qualifiedName, [critical], permissions);
    expect(criticalResult.request).toBeDefined();
    expect(criticalResult.executions).toBe(0);
    const allowed = await approvalRequest(
      CONNECTOR_TOOL.qualifiedName,
      [CONNECTOR_TOOL],
      permissions,
    );
    expect(allowed.request).toBeUndefined();
    expect(allowed.executions).toBe(1);
  });

  it('pauses a scheduled run at a critical tool under a saved allow instead of running it unasked', async () => {
    const critical = { ...CONNECTOR_TOOL, annotations: { destructiveHint: true } };
    const permissions = connectorToolPermissionsFromEntries([
      { connectorId: critical.serverId, toolName: critical.toolName, level: 'allow' },
    ]);
    const scheduled = { unattended: true, unattendedEscalationPauses: true };
    const criticalResult = await approvalRequest(
      critical.qualifiedName,
      [critical],
      permissions,
      undefined,
      scheduled,
    );
    expect(criticalResult.executions).toBe(0);
    expect(criticalResult.checkpoint?.pendingToolCalls[0]?.qualifiedName).toBe(
      critical.qualifiedName,
    );
    const allowed = await approvalRequest(
      CONNECTOR_TOOL.qualifiedName,
      [CONNECTOR_TOOL],
      permissions,
      undefined,
      scheduled,
    );
    expect(allowed.executions).toBe(1);
  });

  it('lets a critical tool run within a conversation it was allowed for', async () => {
    const critical = { ...CONNECTOR_TOOL, annotations: { destructiveHint: true } };
    const permissions = withSessionGrants(
      connectorToolPermissionsFromEntries([]),
      new Map([[`${critical.serverId} ${critical.toolName}`, 'critical']]),
    );
    const freshCheck = vi.fn(async () => null);
    const result = await approvalRequest(
      critical.qualifiedName,
      [critical],
      permissions,
      freshCheck,
    );
    expect(result.request).toBeUndefined();
    expect(result.executions).toBe(1);
    expect(freshCheck).toHaveBeenCalledWith(critical.qualifiedName, 'critical');
  });

  it('offers every scope for a declared non-destructive connector tool', async () => {
    expect(
      (await approvalRequest(DECLARED_READ.qualifiedName, [DECLARED_READ], availablePermissions))
        .request,
    ).toMatchObject({
      risk_tier: 'low',
      destructive: false,
      approval_scopes: ['once', 'session', 'always'],
    });
  });

  it('persists exactly the scopes emitted to the client in its server checkpoint', async () => {
    for (const permissions of [undefined, availablePermissions]) {
      const result = await approvalRequest(
        CONNECTOR_TOOL.qualifiedName,
        [CONNECTOR_TOOL],
        permissions,
      );
      expect(result.checkpoint?.pendingToolCalls).toEqual([
        {
          id: 'fixture-matrix-call',
          qualifiedName: CONNECTOR_TOOL.qualifiedName,
          args: {},
          approvalScopes: result.request?.['approval_scopes'],
        },
      ]);
    }
  });

  it('offers only once when scoped storage availability is not confirmed', async () => {
    const result = await approvalRequest(CONNECTOR_TOOL.qualifiedName, [CONNECTOR_TOOL]);
    expect(result.request).toMatchObject({ approval_scopes: ['once'] });
    expect(result.executions).toBe(0);
  });

  it('does not invoke a tool when its conversation grant was revoked before dispatch', async () => {
    const permissions = withSessionGrants(
      connectorToolPermissionsFromEntries([]),
      new Map([[`${CONNECTOR_TOOL.serverId} ${CONNECTOR_TOOL.toolName}`, 'high']]),
    );
    const freshCheck = vi.fn(async () => ({
      content: 'Grant revoked',
      isError: true,
      unavailable: true,
    }));
    const result = await approvalRequest(
      CONNECTOR_TOOL.qualifiedName,
      [CONNECTOR_TOOL],
      permissions,
      freshCheck,
    );
    expect(result.executions).toBe(0);
    expect(freshCheck).toHaveBeenCalledWith(CONNECTOR_TOOL.qualifiedName, 'high');
    expect(result.output).toContain('Grant revoked');
  });

  it('does not invoke a session-granted tool without the fresh dispatch check', async () => {
    const permissions = withSessionGrants(
      connectorToolPermissionsFromEntries([]),
      new Map([[`${CONNECTOR_TOOL.serverId} ${CONNECTOR_TOOL.toolName}`, 'high']]),
    );
    const result = await approvalRequest(
      CONNECTOR_TOOL.qualifiedName,
      [CONNECTOR_TOOL],
      permissions,
    );
    expect(result.executions).toBe(0);
    expect(result.output).toContain('cannot be confirmed');
  });

  it('offers only this call for a platform tool, which has no connector verdict to remember', async () => {
    expect((await approvalRequest('write_file', [])).request).toMatchObject({
      approval_scopes: ['once'],
    });
  });
});
