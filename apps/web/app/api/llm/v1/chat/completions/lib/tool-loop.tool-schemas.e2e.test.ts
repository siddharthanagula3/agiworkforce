import { createManagedToolInventoryMessage } from './request-processor';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseAgentEventDelta } from '@agiworkforce/cloud-contracts';
import { applyAgentActivityEvent } from '@agiworkforce/client-runtime';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';

type McpExecutorModule = typeof import('@/lib/mcp-tool-executor');
type SecurityAuditModule = typeof import('@/lib/security-audit');

vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<SecurityAuditModule>()),
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

const mockBuildToolLoopStream = vi.fn();
vi.mock('./tool-loop-anthropic', () => ({
  buildToolLoopStream: (...args: unknown[]) => mockBuildToolLoopStream(...args),
  buildServingRouteId: (...args: unknown[]) => args.join(':'),
}));

vi.mock('@/lib/e2b/runtime', () => ({
  getE2BExecutor: vi.fn(),
  pauseE2BSession: vi.fn(),
}));

vi.mock('@/lib/mcp-tool-executor', async () => {
  const actual = await vi.importActual<McpExecutorModule>('@/lib/mcp-tool-executor');
  return { ...actual, executeWebMcpTool: vi.fn(), getWebMcpCatalog: vi.fn() };
});

import {
  runToolLoop,
  type ConnectorToolExecutor,
  type ToolLoopApprovalCheckpoint,
  type ToolLoopToolExecutor,
} from './tool-loop';
import { TOOL_DIRECTORY_TOOL_NAME } from './tool-schema-loader';
import {
  policyAutoApprovesTool,
  resolveToolMetadata,
  resolveConnectorToolMetadata,
  toolRiskTier,
} from './tool-metadata';
import { connectorToolPermissionsFromEntries } from './connector-tool-permissions';
import {
  buildApprovalCheckpointRequest,
  restoreCheckpointedTurn,
} from './approval-checkpoint-request';
import type { ProcessedRequest } from './request-processor';
import { MANAGED_TOOL_INVENTORY_MESSAGE_NAME } from './managed-tool-inventory';
import { CHAT_SYSTEM_PROMPT_PINNED_VERSION } from '@/lib/prompts/chat-system-prompt';
import { SYSTEM_PROMPT_CACHE_BOUNDARY } from '@agiworkforce/provider-protocol';

const PULL_REQUEST_TOOL = 'mcp__github__get_pull_request_diff';
const SLACK_TOOL = 'mcp__slack__post_channel_message';
const JIRA_TOOL = 'mcp__jira__create_issue';
const NOTION_SELF_TOOL = 'mcp__notion__notion-get-self';

const NOTION_SELF_DEF = {
  qualifiedName: NOTION_SELF_TOOL,
  serverId: 'notion',
  toolName: 'notion-get-self',
  description: 'Read the current signed-in identity.',
  origin: 'connector' as const,
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
};

function connectorToolDefs() {
  return [
    {
      qualifiedName: PULL_REQUEST_TOOL,
      serverId: 'github',
      toolName: 'get_pull_request_diff',
      description: 'Read the diff of a pull request.',
      origin: 'connector' as const,
      inputSchema: {},
    },
    {
      qualifiedName: SLACK_TOOL,
      serverId: 'slack',
      toolName: 'post_channel_message',
      description: 'Post a message into a channel.',
      origin: 'connector' as const,
      inputSchema: {},
    },
    {
      qualifiedName: JIRA_TOOL,
      serverId: 'jira',
      toolName: 'create_issue',
      description: 'File a ticket on a board.',
      origin: 'connector' as const,
      inputSchema: {},
    },
  ];
}

function sseStreamFrom(lines: string[]): ReadableStream {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line));
      controller.close();
    },
  });
}

function chunk(delta: Record<string, unknown>, finishReason: string | null = null): string {
  return `data: ${JSON.stringify({
    choices: [{ index: 0, delta, finish_reason: finishReason }],
    model: 'test-model',
  })}\n\n`;
}

function toolCallStream(id: string, name: string, args: unknown): ReadableStream {
  return sseStreamFrom([
    chunk({ tool_calls: [{ index: 0, id, function: { name, arguments: '' } }] }),
    chunk({ tool_calls: [{ index: 0, function: { arguments: JSON.stringify(args) } }] }),
    chunk({}, 'tool_calls'),
  ]);
}

function makeProcessed(turnText: string): ProcessedRequest {
  const messages = [{ role: 'user' as const, content: turnText }];
  return {
    chatSurface: 'web' as const,
    requestId: 'req-schemas-1',
    chatRequest: { model: 'gpt-test', messages, stream: true } as never,
    conversationId: undefined,
    requestedModel: 'gpt-test',
    provider: 'openai',
    estimatedCostCents: 0,
    estimatedPromptTokens: 0,
    maxTokens: 1000,
    usedFallback: false,
    fallbackReason: undefined,
    originalModel: 'gpt-test',
    resolvedTaskType: 'general' as never,
    classifierConfidence: 1,
    resolvedSlot: null,
    quotaFeature: 'chat' as never,
    quotaWarningHeader: null,
    isFlagshipRequest: false,
    indicResult: undefined as never,
    llmRequest: { model: 'gpt-test', messages, max_tokens: 1000, stream: true },
  } as ProcessedRequest;
}

async function drain(gen: AsyncGenerator<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let out = '';
  for await (const value of gen) out += decoder.decode(value);
  return out;
}

function offeredNames(call: number): string[] {
  const request = mockBuildToolLoopStream.mock.calls[call]?.[2] as
    { tools?: Array<{ function?: { name?: string } }> } | undefined;
  return (request?.tools ?? []).map((tool) => tool.function?.name ?? '');
}

function agentEvents(output: string): AgentEventEnvelope[] {
  return output
    .split('\n')
    .filter((line) => line.startsWith('data: {'))
    .flatMap((line) => {
      const payload = JSON.parse(line.slice(6)) as {
        choices?: Array<{ delta?: { x_agent_event?: unknown } }>;
      };
      const event = parseAgentEventDelta(payload.choices?.[0]?.delta?.x_agent_event);
      return event ? [event] : [];
    });
}

function restoreApproval(
  checkpoint: ToolLoopApprovalCheckpoint,
  prior: ProcessedRequest,
): ProcessedRequest {
  const restored = makeProcessed('read the pull request diff for me');
  const schemaState = (
    checkpoint as ToolLoopApprovalCheckpoint & {
      toolSchemaState?: { loadedQualifiedNames: string[] };
    }
  ).toolSchemaState;
  const request = buildApprovalCheckpointRequest(
    prior.chatRequest,
    {},
    [],
    undefined,
    undefined,
    schemaState,
  );
  restoreCheckpointedTurn(
    restored,
    JSON.parse(JSON.stringify({ request, messages: checkpoint.messages })),
  );
  if (prior.managedToolInventoryVersion !== undefined)
    restored.managedToolInventoryVersion = CHAT_SYSTEM_PROMPT_PINNED_VERSION;
  return restored;
}

function resumeCursor(checkpoint: ToolLoopApprovalCheckpoint) {
  return {
    eventSessionId: checkpoint.sessionId,
    eventTurnId: checkpoint.turnId,
    initialEventSequence: checkpoint.nextEventSequence,
    initialCompletedSteps: checkpoint.completedSteps,
  };
}

beforeEach(() => {
  mockBuildToolLoopStream.mockReset();
});

describe('connector tool schemas are loaded against a budget, not sent whole', () => {
  it('renders the exact offered schema names in each provider inventory without editing its source', async () => {
    const processed = makeProcessed('read the pull request diff for me');
    processed.managedToolInventoryVersion = CHAT_SYSTEM_PROMPT_PINNED_VERSION;
    processed.llmRequest.messages.unshift(
      { role: 'system', content: `Stable policy.${SYSTEM_PROMPT_CACHE_BOUNDARY}Turn context.` },
      {
        role: 'system',
        name: MANAGED_TOOL_INVENTORY_MESSAGE_NAME,
        __managedToolInventoryVersion: CHAT_SYSTEM_PROMPT_PINNED_VERSION,
        content: 'Initial inventory snapshot.',
      },
    );
    const originalMessages = structuredClone(processed.llmRequest.messages);
    mockBuildToolLoopStream
      .mockResolvedValueOnce(
        toolCallStream('inventory-loader-call', TOOL_DIRECTORY_TOOL_NAME, { names: [SLACK_TOOL] }),
      )
      .mockResolvedValueOnce(
        sseStreamFrom([chunk({ content: 'Schema ready.' }), chunk({}, 'stop')]),
      );

    await drain(runToolLoop(processed, { approvalMode: 'auto', mcpTools: connectorToolDefs() }));

    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(2);
    for (let step = 0; step < 2; step++) {
      const request = mockBuildToolLoopStream.mock.calls[
        step
      ]?.[2] as ProcessedRequest['llmRequest'];
      const inventory = request.messages.find(
        (message) => message.name === MANAGED_TOOL_INVENTORY_MESSAGE_NAME,
      );
      const names = [...(inventory?.content ?? '').matchAll(/^- ([a-zA-Z0-9_-]+)/gm)].map(
        (match) => match[1],
      );
      expect(names.sort()).toEqual(offeredNames(step).sort());
      expect(inventory?.content).not.toContain('Post a message into a channel.');
    }
    expect(offeredNames(0)).not.toContain(SLACK_TOOL);
    expect(offeredNames(1)).toContain(SLACK_TOOL);
    expect(processed.llmRequest.messages).toEqual(originalMessages);
  });

  it('classifies the local metadata loader without granting a connector call approval', () => {
    expect(resolveToolMetadata(TOOL_DIRECTORY_TOOL_NAME)).toMatchObject({
      actionClass: 'read',
      reversible: true,
      acceptsUntrustedContent: true,
      createsEgressPath: false,
      declared: true,
    });
    expect(toolRiskTier(TOOL_DIRECTORY_TOOL_NAME)).toBe('low');
    expect(policyAutoApprovesTool('ask_every_time', TOOL_DIRECTORY_TOOL_NAME)).toBe(false);
    expect(policyAutoApprovesTool('auto_approve_read_only', TOOL_DIRECTORY_TOOL_NAME)).toBe(true);
    expect(policyAutoApprovesTool('auto_approve_read_only', NOTION_SELF_TOOL)).toBe(false);
    expect(
      resolveConnectorToolMetadata('untrusted-server', TOOL_DIRECTORY_TOOL_NAME),
    ).toMatchObject({
      declared: false,
      actionClass: 'write',
    });
    expect(
      policyAutoApprovesTool(
        'auto_approve_read_only',
        `mcp__untrusted-server__${TOOL_DIRECTORY_TOOL_NAME}`,
      ),
    ).toBe(false);
  });

  it('resumes an approved loader, checkpoints its schemas, and still asks before the actual tool', async () => {
    const tools = [...connectorToolDefs(), NOTION_SELF_DEF];
    const connectorExecutor = vi.fn<ConnectorToolExecutor>(async () => ({
      handled: true,
      content: '{"fixtureIdentity":true}',
      isError: false,
    }));
    const checkpoints: ToolLoopApprovalCheckpoint[] = [];
    const toolExecutor = vi.fn<ToolLoopToolExecutor>(({ execute }) => execute());
    const options = {
      mcpTools: tools,
      approvalMode: 'manual' as const,
      toolApprovalPolicy: 'ask_every_time' as const,
      userId: 'schema-fixture-user',
      connectorExecutor,
      toolExecutor,
      onApprovalCheckpoint: async (checkpoint: ToolLoopApprovalCheckpoint) => {
        checkpoints.push(structuredClone(checkpoint));
      },
    };
    mockBuildToolLoopStream
      .mockResolvedValueOnce(
        toolCallStream('schema-loader-call', TOOL_DIRECTORY_TOOL_NAME, {
          names: [NOTION_SELF_TOOL],
          query: '',
        }),
      )
      .mockResolvedValueOnce(toolCallStream('notion-self-call', NOTION_SELF_TOOL, {}))
      .mockResolvedValueOnce(
        sseStreamFrom([chunk({ content: 'Fixture read complete.' }), chunk({}, 'stop')]),
      );
    const first = makeProcessed('read the pull request diff for me');
    first.managedToolInventoryVersion = CHAT_SYSTEM_PROMPT_PINNED_VERSION;
    first.llmRequest.messages.unshift(
      createManagedToolInventoryMessage([], { variants: { 'chat.system': 2 } }),
    );
    const sourceMessages = structuredClone(first.llmRequest.messages);
    const firstOutput = await drain(runToolLoop(first, options));
    expect(checkpoints).toHaveLength(1);
    expect(connectorExecutor).not.toHaveBeenCalled();
    const second = restoreApproval(checkpoints[0]!, first);
    const secondOutput = await drain(
      runToolLoop(second, {
        ...options,
        ...resumeCursor(checkpoints[0]!),
        resume: { approvals: [{ toolCallId: 'schema-loader-call', decision: 'approved' }] },
      }),
    );
    expect(secondOutput).toContain('Loaded 1 tool schema(s)');
    expect(offeredNames(1)).toContain(NOTION_SELF_TOOL);
    expect(checkpoints).toHaveLength(2);
    expect(connectorExecutor).not.toHaveBeenCalled();
    expect(toolExecutor).not.toHaveBeenCalled();
    const third = restoreApproval(checkpoints[1]!, second);
    const thirdOutput = await drain(
      runToolLoop(third, {
        ...options,
        ...resumeCursor(checkpoints[1]!),
        resume: { approvals: [{ toolCallId: 'notion-self-call', decision: 'approved' }] },
      }),
    );
    expect(connectorExecutor).toHaveBeenCalledExactlyOnceWith(
      'notion',
      'notion-get-self',
      {},
      expect.any(Object),
    );
    expect(offeredNames(2)).toContain(NOTION_SELF_TOOL);
    expect(toolExecutor).toHaveBeenCalledTimes(1);
    for (let step = 0; step < 3; step++) {
      const request = mockBuildToolLoopStream.mock.calls[
        step
      ]?.[2] as ProcessedRequest['llmRequest'];
      const inventory = request.messages.find(
        (message) => message.name === MANAGED_TOOL_INVENTORY_MESSAGE_NAME,
      );
      expect(inventory?.__managedToolInventoryVersion).toBe(2);
      if (step > 0) expect(inventory?.content).toContain(`- ${NOTION_SELF_TOOL}`);
    }
    expect(first.llmRequest.messages).toEqual(sourceMessages);
    for (const checkpoint of checkpoints)
      expect(
        checkpoint.messages.find((message) => message.name === MANAGED_TOOL_INVENTORY_MESSAGE_NAME),
      ).toEqual(sourceMessages[0]);
    let activity;
    for (const event of agentEvents(firstOutput + secondOutput + thirdOutput))
      activity = applyAgentActivityEvent(activity, event);
    const reopened = JSON.parse(JSON.stringify(activity));
    expect(
      reopened.entries.find(
        (entry: { toolCallId?: string }) => entry.toolCallId === 'schema-loader-call',
      ),
    ).toMatchObject({ status: 'completed', summary: 'Load connector tools' });
    expect(
      reopened.entries.find(
        (entry: { toolCallId?: string }) => entry.toolCallId === 'notion-self-call',
      ),
    ).toMatchObject({ status: 'completed' });
  });

  it('ends the activity row when an approved helper is no longer offered on resume', async () => {
    let checkpoint: ToolLoopApprovalCheckpoint | undefined;
    const first = makeProcessed('read the pull request diff for me');
    mockBuildToolLoopStream
      .mockResolvedValueOnce(
        toolCallStream('removed-loader-call', TOOL_DIRECTORY_TOOL_NAME, { names: [SLACK_TOOL] }),
      )
      .mockResolvedValueOnce(
        sseStreamFrom([chunk({ content: 'Unavailable.' }), chunk({}, 'stop')]),
      );
    const firstOutput = await drain(
      runToolLoop(first, {
        mcpTools: connectorToolDefs(),
        approvalMode: 'manual',
        toolApprovalPolicy: 'ask_every_time',
        onApprovalCheckpoint: async (saved) => {
          checkpoint = saved;
        },
      }),
    );
    expect(checkpoint).toBeDefined();
    const output = await drain(
      runToolLoop(restoreApproval(checkpoint!, first), {
        ...resumeCursor(checkpoint!),
        mcpTools: [],
        approvalMode: 'manual',
        toolApprovalPolicy: 'ask_every_time',
        resume: { approvals: [{ toolCallId: 'removed-loader-call', decision: 'approved' }] },
      }),
    );
    expect(agentEvents(output).map((envelope) => envelope.event)).toContainEqual(
      expect.objectContaining({
        type: 'tool-execution-end',
        toolCallId: 'removed-loader-call',
        isError: true,
      }),
    );
    let activity;
    for (const event of agentEvents(firstOutput + output))
      activity = applyAgentActivityEvent(activity, event);
    expect(
      activity?.entries.find(
        (entry) => entry.kind === 'tool' && entry.toolCallId === 'removed-loader-call',
      ),
    ).toMatchObject({ status: 'failed' });
  });

  it('intersects checkpoint names with the live catalog and current denied permissions', async () => {
    const processed = makeProcessed('read the pull request diff for me');
    processed.toolSchemaState = { loadedQualifiedNames: [NOTION_SELF_TOOL, 'mcp__unknown__read'] };
    const permissions = connectorToolPermissionsFromEntries([
      {
        connectorId: 'notion',
        toolName: 'notion-get-self',
        level: 'deny',
      },
    ]);
    mockBuildToolLoopStream.mockResolvedValueOnce(
      sseStreamFrom([chunk({ content: 'Nothing executed.' }), chunk({}, 'stop')]),
    );
    await drain(
      runToolLoop(processed, {
        mcpTools: [...connectorToolDefs(), NOTION_SELF_DEF],
        connectorPermissions: permissions,
        approvalMode: 'manual',
      }),
    );
    expect(offeredNames(0)).not.toContain(NOTION_SELF_TOOL);
    expect(offeredNames(0)).not.toContain('mcp__unknown__read');
    expect(processed.toolSchemaState?.loadedQualifiedNames).not.toContain(NOTION_SELF_TOOL);
    expect(processed.toolSchemaState?.loadedQualifiedNames).not.toContain('mcp__unknown__read');
  });

  it('does not execute a loaded tool after its approval is rejected', async () => {
    const first = makeProcessed('read the pull request diff for me');
    first.toolSchemaState = { loadedQualifiedNames: [NOTION_SELF_TOOL] };
    let checkpoint: ToolLoopApprovalCheckpoint | undefined;
    const connectorExecutor = vi.fn<ConnectorToolExecutor>(async () => ({
      handled: true,
      content: 'must not run',
      isError: false,
    }));
    mockBuildToolLoopStream
      .mockResolvedValueOnce(toolCallStream('rejected-notion-call', NOTION_SELF_TOOL, {}))
      .mockResolvedValueOnce(
        sseStreamFrom([chunk({ content: 'Permission denied.' }), chunk({}, 'stop')]),
      );
    const firstOutput = await drain(
      runToolLoop(first, {
        mcpTools: [...connectorToolDefs(), NOTION_SELF_DEF],
        approvalMode: 'manual',
        toolApprovalPolicy: 'ask_every_time',
        onApprovalCheckpoint: async (saved) => {
          checkpoint = saved;
        },
      }),
    );
    expect(checkpoint).toBeDefined();
    const output = await drain(
      runToolLoop(restoreApproval(checkpoint!, first), {
        ...resumeCursor(checkpoint!),
        mcpTools: [...connectorToolDefs(), NOTION_SELF_DEF],
        approvalMode: 'manual',
        toolApprovalPolicy: 'ask_every_time',
        connectorExecutor,
        resume: { approvals: [{ toolCallId: 'rejected-notion-call', decision: 'rejected' }] },
      }),
    );
    expect(connectorExecutor).not.toHaveBeenCalled();
    let activity;
    for (const event of agentEvents(firstOutput + output))
      activity = applyAgentActivityEvent(activity, event);
    expect(
      activity?.entries.find(
        (entry) => entry.kind === 'tool' && entry.toolCallId === 'rejected-notion-call',
      ),
    ).toMatchObject({ status: 'failed' });
  });

  it('offers every schema when nothing in the turn prefers one', async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(
      sseStreamFrom([chunk({ content: 'Nothing to do.' }), chunk({}, 'stop')]),
    );

    await drain(
      runToolLoop(makeProcessed('hello'), {
        approvalMode: 'auto',
        userId: 'user-1',
        mcpTools: connectorToolDefs(),
      }),
    );

    const names = offeredNames(0);
    expect(names).toContain(PULL_REQUEST_TOOL);
    expect(names).toContain(SLACK_TOOL);
    expect(names).toContain(JIRA_TOOL);
    expect(names).not.toContain(TOOL_DIRECTORY_TOOL_NAME);
  });

  it('defers the schemas the turn does not reach for, and names them rather than hiding them', async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(
      sseStreamFrom([chunk({ content: 'Reading it now.' }), chunk({}, 'stop')]),
    );

    await drain(
      runToolLoop(makeProcessed('read the pull request diff for me'), {
        approvalMode: 'auto',
        userId: 'user-1',
        mcpTools: connectorToolDefs(),
      }),
    );

    const names = offeredNames(0);
    expect(names).toContain(PULL_REQUEST_TOOL);
    expect(names).not.toContain(SLACK_TOOL);
    expect(names).not.toContain(JIRA_TOOL);
    expect(names).toContain(TOOL_DIRECTORY_TOOL_NAME);

    const directory = (
      mockBuildToolLoopStream.mock.calls[0]?.[2] as {
        tools: Array<{ function: { name: string; description: string } }>;
      }
    ).tools.find((tool) => tool.function.name === TOOL_DIRECTORY_TOOL_NAME);
    expect(directory?.function.description).toContain(SLACK_TOOL);
    expect(directory?.function.description).toContain(JIRA_TOOL);
  });

  it('carries a deferred schema on the next step once the model asks for it', async () => {
    mockBuildToolLoopStream
      .mockResolvedValueOnce(
        toolCallStream('call_1', TOOL_DIRECTORY_TOOL_NAME, { names: [SLACK_TOOL] }),
      )
      .mockResolvedValueOnce(
        sseStreamFrom([chunk({ content: 'Posted the summary.' }), chunk({}, 'stop')]),
      );

    const connectorExecutor: ConnectorToolExecutor = vi.fn(async () => ({
      handled: true,
      content: 'never reached',
      isError: false,
    }));

    const output = await drain(
      runToolLoop(makeProcessed('read the pull request diff for me'), {
        approvalMode: 'auto',
        userId: 'user-1',
        connectorExecutor,
        mcpTools: connectorToolDefs(),
      }),
    );

    // The directory call is answered here, never routed to a connector.
    expect(connectorExecutor).not.toHaveBeenCalled();
    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(2);

    const second = offeredNames(1);
    expect(second).toContain(SLACK_TOOL);
    expect(second).toContain(PULL_REQUEST_TOOL);
    expect(second).not.toContain(JIRA_TOOL);
    // Jira is still deferred, so the directory stays on offer.
    expect(second).toContain(TOOL_DIRECTORY_TOOL_NAME);
    expect(output).toContain('Posted the summary.');
  });

  it('refuses a name no connected tool carries instead of silently loading nothing', async () => {
    mockBuildToolLoopStream
      .mockResolvedValueOnce(
        toolCallStream('call_1', TOOL_DIRECTORY_TOOL_NAME, { names: ['mcp__nope__nothing'] }),
      )
      .mockResolvedValueOnce(sseStreamFrom([chunk({ content: 'Sorry.' }), chunk({}, 'stop')]));

    await drain(
      runToolLoop(makeProcessed('read the pull request diff for me'), {
        approvalMode: 'auto',
        userId: 'user-1',
        mcpTools: connectorToolDefs(),
      }),
    );

    const second = mockBuildToolLoopStream.mock.calls[1]?.[2] as {
      messages: Array<{ role: string; content: string }>;
    };
    const result = second.messages.find((message) => message.role === 'tool');
    expect(result?.content).toContain('No connected tool matched those names');
    expect(offeredNames(1)).not.toContain(SLACK_TOOL);
  });
});
