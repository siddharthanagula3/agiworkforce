import { contextPolicySnapshotFixture } from '@/lib/services/__tests__/fixtures/context-policy-snapshot';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const order: string[] = [];

type Checkpoint = Record<string, unknown>;
type CheckpointCallbacks = Record<string, (checkpoint: Checkpoint) => Promise<void>>;

const mocks = vi.hoisted(() => ({
  runToolLoop: vi.fn(),
  executeOperation: vi.fn(),
  settle: vi.fn(),
  projectChunk: vi.fn(),
  getNeonDb: vi.fn(),
  getRun: vi.fn(),
  writable: vi.fn(),
  saveApproval: vi.fn(),
  savePause: vi.fn(),
  saveInput: vi.fn(),
  saveDevice: vi.fn(),
  journalAppend: vi.fn(),
  journalFlush: vi.fn(),
}));

const db = { query: vi.fn(), execute: vi.fn(), transaction: vi.fn() };

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule7>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('workflow', () => ({
  FatalError: class FatalError extends Error {},
  RetryableError: class RetryableError extends Error {},
  getWritable: () => mocks.writable(),
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule6>()),
  getNeonDb: () => mocks.getNeonDb(),
}));
vi.mock('@/app/api/llm/v1/chat/completions/lib/tool-loop', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule5>()),
  applyToolResultSecretPolicy: vi.fn(
    async (_userId: string, _name: string, content: string) => content,
  ),
  hasPrivateContext: vi.fn(() => false),
  hasUntrustedContext: vi.fn(() => false),
  toolResultEvent: vi.fn(() => ''),
  toolStatusEvent: vi.fn(() => ''),
  trimToolResultHistory: vi.fn(),
  runToolLoop: mocks.runToolLoop,
}));
vi.mock(
  '@/app/api/llm/v1/chat/completions/lib/approval-checkpoint-request',
  async (importOriginal) => ({
    ...(await importOriginal<ImportedModule4>()),
    buildApprovalCheckpointRequest: vi.fn(() => ({})),
  }),
);
vi.mock('./cloud-agent-operation-executor', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule3>()),
  executeCloudAgentOperation: mocks.executeOperation,
}));
vi.mock('./steps/settle-workflow-invocation', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule2>()),
  settleWorkflowInvocation: mocks.settle,
}));
vi.mock('./cloud-agent-workflow-stream', () => ({
  projectCloudAgentWorkflowChunk: mocks.projectChunk,
}));
vi.mock('@/lib/services/cloud-agent-run-service', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule1>()),
  takeCloudAgentRunSteers: vi.fn(async () => []),
  APPROVAL_CHECKPOINT_TTL_HOURS: 24,
  appendCloudAgentEvent: vi.fn(),
  appendCloudAgentEvents: vi.fn(),
  getCloudAgentRun: mocks.getRun,
  isCloudAgentRunCancellationRequested: vi.fn(async () => false),
  isCloudAgentRunPauseRequested: vi.fn(async () => false),
  saveCloudAgentPauseCheckpoint: mocks.savePause,
  saveCloudAgentApprovalCheckpoint: mocks.saveApproval,
  saveCloudAgentInputCheckpoint: mocks.saveInput,
  saveCloudAgentDeviceCheckpoint: mocks.saveDevice,
  completeCloudAgentApprovalCheckpoint: vi.fn(),
  readCloudAgentRunAssistantText: vi.fn(),
  recordCloudAgentRunSettledUsage: vi.fn(),
  transitionCloudAgentRun: vi.fn(),
}));
vi.mock('@/lib/services/cloud-agent-event-journal', () => ({
  createCloudAgentEventJournal: () => ({
    append: mocks.journalAppend,
    flush: mocks.journalFlush,
  }),
}));
vi.mock('@/lib/user-connector-tools', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  makeUserConnectorExecutor: vi.fn(),
}));

import { executeCloudAgentWorkflowInvocation } from './steps/execute-cloud-agent-invocation';
import type { CloudAgentWorkflowInput } from './cloud-agent-workflow-input';

const RUN_ID = '0190a000-0000-7000-8000-000000000001';

function makeInput(): CloudAgentWorkflowInput {
  return {
    version: 1,
    runId: RUN_ID,
    userId: 'user-1',
    processed: {
      contextPolicySnapshot: contextPolicySnapshotFixture(),
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
      kind: 'free_trial',
      userId: 'user-1',
      requestId: 'agi.chat.web.send.free-turn-1',
      reservedMicrousd: 5_000,
    },
    mcpTools: [],
    approvalMode: 'manual',
  };
}

const CHECKPOINT: Checkpoint = {
  sessionId: 's',
  turnId: 't',
  nextEventSequence: 9,
  completedSteps: [],
  toolSchemaState: undefined,
  messages: [],
  pendingToolCalls: [],
  inputRequests: [],
  requestState: undefined,
  deviceStep: undefined,
  events: [],
};

const CHECKPOINTS: ReadonlyArray<[string, keyof typeof mocks]> = [
  ['onApprovalCheckpoint', 'saveApproval'],
  ['onPauseCheckpoint', 'savePause'],
  ['onInputCheckpoint', 'saveInput'],
  ['onDeviceCheckpoint', 'saveDevice'],
];

beforeEach(() => {
  vi.clearAllMocks();
  order.length = 0;
  db.query.mockImplementation(async (sql: string) =>
    sql.includes('gmail_data_quarantined')
      ? [{ conversation_id: null, gmail_data_quarantined: false }]
      : [],
  );
  mocks.getNeonDb.mockReturnValue(db);
  mocks.getRun.mockResolvedValue({ run: { lastEventSequence: -1 } });
  mocks.writable.mockReturnValue({
    getWriter: () => ({
      write: vi.fn(async () => undefined),
      releaseLock: vi.fn(),
      close: vi.fn(async () => undefined),
    }),
  });
  mocks.projectChunk.mockReturnValue([
    {
      sse: 'data: {}\n\n',
      envelope: { sessionId: 's', turnId: 't', sequence: 8, event: { type: 'text-delta' } },
    },
  ]);
  mocks.journalAppend.mockImplementation(async () => {
    order.push('append');
  });
  mocks.journalFlush.mockImplementation(async () => {
    order.push('flush');
  });
  for (const save of [mocks.saveApproval, mocks.savePause, mocks.saveInput, mocks.saveDevice]) {
    save.mockImplementation(async () => {
      order.push('checkpoint');
    });
  }
});

describe('a durable turn that reaches a checkpoint with buffered events', () => {
  it.each(CHECKPOINTS)(
    'journals the buffered events before %s publishes higher sequences',
    async (callbackName, saveMock) => {
      mocks.runToolLoop.mockImplementation((_processed: unknown, options: CheckpointCallbacks) =>
        (async function* () {
          yield { type: 'text-delta', delta: '<' };
          await options[callbackName]!(CHECKPOINT);
        })(),
      );

      await executeCloudAgentWorkflowInvocation(makeInput());

      expect(mocks[saveMock]).toHaveBeenCalledTimes(1);
      const appended = order.indexOf('append');
      const checkpoint = order.indexOf('checkpoint');
      expect(appended).toBeGreaterThan(-1);
      expect(checkpoint).toBeGreaterThan(appended);
      expect(order.slice(appended, checkpoint)).toContain('flush');
    },
  );
});

type ImportedModule7 = typeof import('@/lib/logger');
type ImportedModule6 = typeof import('@/lib/server/neon-db');
type ImportedModule5 = typeof import('@/app/api/llm/v1/chat/completions/lib/tool-loop');
type ImportedModule4 =
  typeof import('@/app/api/llm/v1/chat/completions/lib/approval-checkpoint-request');
type ImportedModule3 = typeof import('./cloud-agent-operation-executor');
type ImportedModule2 = typeof import('./steps/settle-workflow-invocation');
type ImportedModule1 = typeof import('@/lib/services/cloud-agent-run-service');
type ImportedModule0 = typeof import('@/lib/user-connector-tools');
