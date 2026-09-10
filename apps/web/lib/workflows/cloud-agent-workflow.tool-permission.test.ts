import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runToolLoop: vi.fn(),
  executeOperation: vi.fn(),
  settle: vi.fn(),
  appendEvent: vi.fn(),
  projectChunk: vi.fn(),
  writer: {
    write: vi.fn(async () => undefined),
    releaseLock: vi.fn(),
    close: vi.fn(async () => undefined),
  },
}));

const db = { query: vi.fn(), execute: vi.fn(), transaction: vi.fn() };

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('workflow', () => ({
  FatalError: class FatalError extends Error {},
  RetryableError: class RetryableError extends Error {},
  getWritable: () => ({ getWriter: () => mocks.writer }),
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => db }));
vi.mock('@/app/api/llm/v1/chat/completions/lib/tool-loop', () => ({
  runToolLoop: mocks.runToolLoop,
  mapWithConcurrency: vi.fn(),
}));
vi.mock('./cloud-agent-operation-executor', () => ({
  executeCloudAgentOperation: mocks.executeOperation,
}));
vi.mock('./steps/settle-workflow-invocation', () => ({ settleWorkflowInvocation: mocks.settle }));
vi.mock('./cloud-agent-workflow-stream', () => ({
  projectCloudAgentWorkflowChunk: mocks.projectChunk,
}));
vi.mock('@/lib/services/cloud-agent-run-service', () => ({
  appendCloudAgentEvent: mocks.appendEvent,
  appendCloudAgentEvents: vi.fn(),
  getCloudAgentRun: vi.fn(),
  isCloudAgentRunCancellationRequested: vi.fn(async () => false),
  saveCloudAgentApprovalCheckpoint: vi.fn(),
  saveCloudAgentInputCheckpoint: vi.fn(),
  completeCloudAgentApprovalCheckpoint: vi.fn(),
  readCloudAgentRunAssistantText: vi.fn(),
  recordCloudAgentRunSettledUsage: vi.fn(),
  transitionCloudAgentRun: vi.fn(),
}));
vi.mock('@/lib/user-connector-tools', () => ({
  makeUserConnectorExecutor: vi.fn(),
  withUserConnectorMcpHandle: vi.fn(),
}));

import type { ToolLoopToolExecutor } from '@/app/api/llm/v1/chat/completions/lib/tool-loop';
import { executeCloudAgentWorkflowInvocation } from './steps/execute-cloud-agent-invocation';
import type { CloudAgentWorkflowInput } from './cloud-agent-workflow-input';

const RUN_ID = '0190a000-0000-7000-8000-000000000001';
const CONNECTOR_TOOL = 'mcp__gmail__send-email';
const BUILT_IN_TOOL = 'web_search';

const CONNECTOR_TOOL_DEF = {
  qualifiedName: CONNECTOR_TOOL,
  serverId: 'gmail',
  toolName: 'send-email',
  description: 'Send an email',
  origin: 'connector' as const,
  inputSchema: {},
};

function makeInput(): CloudAgentWorkflowInput {
  return {
    version: 1,
    runId: RUN_ID,
    userId: 'user-1',
    processed: {
      requestId: 'agi.chat.web.send.turn-1',
      chatRequest: { model: 'claude-test', messages: [], work_mode: 'agiwork' },
      requestedModel: 'claude-test',
      provider: 'anthropic',
      estimatedCostCents: 0,
      estimatedPromptTokens: 100,
      maxTokens: 4096,
      usedFallback: false,
      originalModel: 'claude-test',
      resolvedTaskType: 'coding',
      classifierConfidence: 1,
      resolvedSlot: null,
      quotaFeature: 'chat',
      quotaWarningHeader: null,
      isFlagshipRequest: false,
      indicResult: {},
      llmRequest: { model: 'claude-test', messages: [], max_tokens: 4096 },
    } as unknown as CloudAgentWorkflowInput['processed'],
    billing: {
      kind: 'managed',
      userId: 'user-1',
      idempotencyKey: 'agi.chat.web.send.paid-turn-1',
      requestHash: 'hash-1',
      leaseToken: '0190a000-0000-7000-8000-000000000002',
      estimatedCostCents: 12,
    },
    mcpTools: [CONNECTOR_TOOL_DEF],
    approvalMode: 'manual',
    connectorPermissions: [{ connectorId: 'gmail', toolName: 'send-email', level: 'allow' }],
  };
}

function storedPermissionLevel(level: string | null): void {
  db.query.mockImplementation(async (sql: unknown) => {
    const text = String(sql);
    if (text.includes('public.user_settings')) return [{ settings: {} }];
    if (text.includes('public.connector_tool_permissions')) {
      return level === null ? [] : [{ connector_id: 'gmail', tool_name: 'send-email', level }];
    }
    return [];
  });
}

function toolExecutorHandedToLoop(): ToolLoopToolExecutor {
  const options = mocks.runToolLoop.mock.calls[0]![1] as { toolExecutor: ToolLoopToolExecutor };
  return options.toolExecutor;
}

function toolCall(qualifiedName: string) {
  return {
    id: 'call-1',
    qualifiedName,
    args: {},
  } as unknown as Parameters<ToolLoopToolExecutor>[0]['toolCall'];
}

async function runDispatch(qualifiedName: string) {
  const execute = vi.fn(async () => ({ content: 'sent', isError: false }));
  const result = await toolExecutorHandedToLoop()({
    operationKey: `tool:${qualifiedName}`,
    idempotencyKey: 'idem-1',
    retrySafety: 'unsafe',
    toolCall: toolCall(qualifiedName),
    execute,
  } as unknown as Parameters<ToolLoopToolExecutor>[0]);
  return { result, execute };
}

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.runToolLoop.mockReturnValue(
    (async function* () {
      // The permission gate is read off the options the loop was constructed
      // with, so the turn itself need not produce chunks.
    })(),
  );
  mocks.settle.mockResolvedValue(undefined);
  mocks.executeOperation.mockImplementation(
    async (_db: unknown, { execute }: { execute: () => Promise<unknown> }) => execute(),
  );
});

describe('a tool blocked mid-run stops running for the rest of the durable run', () => {
  it('refuses a connector tool that was blocked after the run started', async () => {
    storedPermissionLevel(null);
    await executeCloudAgentWorkflowInvocation(makeInput());

    storedPermissionLevel('blocked');
    const { result, execute } = await runDispatch(CONNECTOR_TOOL);

    expect(execute).not.toHaveBeenCalled();
    expect(mocks.executeOperation).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(result.unavailable).toBe(true);
    expect(result.content).toContain(CONNECTOR_TOOL);
  });

  it('still runs the tool while the account allows it', async () => {
    storedPermissionLevel('always-allow');
    await executeCloudAgentWorkflowInvocation(makeInput());

    const { result, execute } = await runDispatch(CONNECTOR_TOOL);

    expect(execute).toHaveBeenCalledTimes(1);
    expect(mocks.executeOperation).toHaveBeenCalledTimes(1);
    expect(result.isError).toBe(false);
  });

  it('re-reads the decision on every dispatch, not once per run', async () => {
    storedPermissionLevel('always-allow');
    await executeCloudAgentWorkflowInvocation(makeInput());

    const first = await runDispatch(CONNECTOR_TOOL);
    expect(first.execute).toHaveBeenCalledTimes(1);

    storedPermissionLevel('blocked');
    const second = await runDispatch(CONNECTOR_TOOL);

    expect(second.execute).not.toHaveBeenCalled();
    expect(second.result.unavailable).toBe(true);
  });

  it('leaves a tool that is not a connector tool alone', async () => {
    storedPermissionLevel('blocked');
    await executeCloudAgentWorkflowInvocation(makeInput());

    const { result, execute } = await runDispatch(BUILT_IN_TOOL);

    expect(execute).toHaveBeenCalledTimes(1);
    expect(result.isError).toBe(false);
  });

  it('refuses rather than running the tool when the decision cannot be read', async () => {
    storedPermissionLevel(null);
    await executeCloudAgentWorkflowInvocation(makeInput());

    db.query.mockRejectedValue(new Error('permission store unreachable'));
    const { result, execute } = await runDispatch(CONNECTOR_TOOL);

    expect(execute).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(result.unavailable).toBe(true);
  });
});
