import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getDefaultModelFor,
  getModelMetadataById,
  getModelRegistryFacts,
  listCanonicalModels,
} from '@agiworkforce/types';
type ScanModule0 = typeof import('@/app/api/llm/v1/chat/completions/lib/managed-failover');
type ScanModule1 = typeof import('@/app/api/llm/v1/chat/completions/lib/research-loop');
type ScanModule2 = typeof import('@/app/api/llm/v1/chat/completions/lib/tool-loop');
type ScanModule3 = typeof import('@/lib/logger');
type ScanModule4 = typeof import('@/lib/server/neon-db');
type ScanModule5 = typeof import('./cloud-agent-operation-executor');
type ScanModule6 = typeof import('./steps/settle-workflow-invocation');
type ScanModule7 = typeof import('./cloud-agent-workflow-stream');
type ScanModule8 = typeof import('@/lib/services/cloud-agent-run-service');
type ScanModule9 = typeof import('@/lib/user-connector-tools');

const mocks = vi.hoisted(() => ({
  runToolLoop: vi.fn(),
  runResearchLoop: vi.fn(),
  writer: {
    write: vi.fn(async () => undefined),
    releaseLock: vi.fn(),
    close: vi.fn(async () => undefined),
  },
}));

const db = { query: vi.fn(), execute: vi.fn(), transaction: vi.fn() };

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<ScanModule3>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('workflow', () => ({
  FatalError: class FatalError extends Error {},
  RetryableError: class RetryableError extends Error {},
  getWritable: () => ({ getWriter: () => mocks.writer }),
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule4>()),
  getNeonDb: () => db,
}));
vi.mock('@/app/api/llm/v1/chat/completions/lib/tool-loop', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  runToolLoop: mocks.runToolLoop,
}));
vi.mock('@/app/api/llm/v1/chat/completions/lib/research-loop', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  runResearchLoop: mocks.runResearchLoop,
}));
vi.mock('@/app/api/llm/v1/chat/completions/lib/managed-failover', async (importOriginal) => {
  const actual = await importOriginal<ScanModule0>();
  const {
    getDefaultModelFor: defaultModel,
    getModelRegistryFacts: facts,
    listCanonicalModels: models,
  } = await import('@agiworkforce/types');
  const failed = defaultModel('pro', 'chat');
  const rescuer = models().find(
    (model) => model.id !== failed && facts(model.id)?.isRouter !== true,
  )?.id;
  return {
    ...actual,
    createFailoverPlan: (processed: Parameters<typeof actual.buildFailoverAttemptView>[0]) => ({
      next: () =>
        rescuer
          ? {
              model: rescuer,
              provider: 'openai',
              processed: actual.buildFailoverAttemptView(processed, rescuer, 'openai'),
            }
          : null,
    }),
  };
});
vi.mock('./cloud-agent-operation-executor', async (importOriginal) => ({
  ...(await importOriginal<ScanModule5>()),
  executeCloudAgentOperation: vi.fn(),
}));
vi.mock('./steps/settle-workflow-invocation', async (importOriginal) => ({
  ...(await importOriginal<ScanModule6>()),
  settleWorkflowInvocation: vi.fn(),
}));
vi.mock('./cloud-agent-workflow-stream', async (importOriginal) => ({
  ...(await importOriginal<ScanModule7>()),
  projectCloudAgentWorkflowChunk: vi.fn(() => []),
}));
vi.mock('@/lib/services/cloud-agent-run-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule8>()),
  takeCloudAgentRunSteers: vi.fn(async () => []),
  isCloudAgentRunCancellationRequested: vi.fn(async () => false),
  isCloudAgentRunPauseRequested: vi.fn(async () => false),
}));
vi.mock('@/lib/user-connector-tools', async (importOriginal) => ({
  ...(await importOriginal<ScanModule9>()),
  makeUserConnectorExecutor: vi.fn(),
}));

import {
  buildCapabilityPreamble,
  servingModelFor,
} from '@/app/api/llm/v1/chat/completions/lib/capability-preamble';
import type { ResearchLoopCheckpoint } from '@/app/api/llm/v1/chat/completions/lib/research-loop';
import { CHAT_SYSTEM_PROMPT_ID } from '@/lib/prompts/chat-system-prompt';

import type { CloudAgentWorkflowInput } from './cloud-agent-workflow-input';
import { executeCloudAgentWorkflowInvocation } from './steps/execute-cloud-agent-invocation';

const RUN_ID = '0190a000-0000-7000-8000-000000000001';
const FAILED_MODEL = getDefaultModelFor('pro', 'chat');
const RESCUER_MODEL = listCanonicalModels().find(
  (model) => model.id !== FAILED_MODEL && getModelRegistryFacts(model.id)?.isRouter !== true,
)?.id;
if (!RESCUER_MODEL) throw new Error('the catalog holds no second concrete model');
const FAILED_NAME = getModelMetadataById(FAILED_MODEL)?.name ?? '';
const RESCUER_NAME = getModelMetadataById(RESCUER_MODEL)?.name ?? '';
const SELECTION = { kind: 'picked' as const, modelId: FAILED_MODEL };

function systemPrompt(): string {
  return String(
    buildCapabilityPreamble({
      now: new Date('2026-10-02T12:00:00.000Z'),
      tools: [],
      surface: 'web',
      promptSelection: { variants: { [CHAT_SYSTEM_PROMPT_ID]: 8 } },
      servingModel: servingModelFor(FAILED_MODEL, SELECTION),
    }),
  );
}

function transcript(): Array<{ role: 'system' | 'user'; content: string }> {
  return [
    { role: 'system', content: systemPrompt() },
    { role: 'user', content: 'Which model are you?' },
  ];
}

function makeInput(research?: CloudAgentWorkflowInput['research']): CloudAgentWorkflowInput {
  return {
    version: 1,
    runId: RUN_ID,
    userId: 'user-1',
    processed: {
      requestId: 'agi.chat.web.send.turn-1',
      chatRequest: { model: FAILED_MODEL, messages: [], work_mode: 'agiwork' },
      requestedModel: FAILED_MODEL,
      provider: 'anthropic',
      estimatedCostCents: 0,
      estimatedPromptTokens: 100,
      maxTokens: 4096,
      usedFallback: false,
      originalModel: FAILED_MODEL,
      resolvedTaskType: 'coding',
      classifierConfidence: 1,
      resolvedSlot: null,
      quotaFeature: 'chat',
      quotaWarningHeader: null,
      isFlagshipRequest: false,
      indicResult: {},
      modelSelection: SELECTION,
      llmRequest: { model: FAILED_MODEL, messages: transcript(), max_tokens: 4096 },
    } as unknown as CloudAgentWorkflowInput['processed'],
    billing: {
      kind: 'managed',
      userId: 'user-1',
      idempotencyKey: 'agi.chat.web.send.paid-turn-1',
      requestHash: 'hash-1',
      leaseToken: '0190a000-0000-7000-8000-000000000002',
      estimatedCostCents: 12,
    },
    mcpTools: [],
    approvalMode: 'manual',
    ...(research ? { research } : {}),
  };
}

function systemText(messages: ReadonlyArray<{ role: string; content: unknown }>): string {
  return messages
    .filter((message) => message.role === 'system')
    .map((message) => String(message.content))
    .join('\n\n');
}

describe('a durable run that continues after a managed failover to another model', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hands the next invocation a transcript that names the model now answering', async () => {
    mocks.runToolLoop.mockImplementation(
      (
        processed: { llmRequest: { messages: Array<{ role: string; content: unknown }> } },
        options: {
          failover: { next: (error: unknown, context: { step: number }) => unknown };
          onInvocationCheckpoint: (checkpoint: unknown) => Promise<void>;
        },
      ) =>
        (async function* () {
          options.failover.next(new Error('overloaded'), { step: 1 });
          await options.onInvocationCheckpoint({
            sessionId: 'session-1',
            turnId: 'turn-1',
            nextEventSequence: 4,
            completedSteps: 1,
            messages: processed.llmRequest.messages.map((message) => ({ ...message })),
          });
          yield new Uint8Array();
        })(),
    );

    const result = await executeCloudAgentWorkflowInvocation(makeInput());

    expect(result.kind).toBe('continue');
    if (result.kind !== 'continue') return;
    const continued = systemText(result.input.processed.llmRequest.messages);
    expect(result.input.processed.chatRequest.model).toBe(RESCUER_MODEL);
    expect(continued).toContain(`This turn runs on ${RESCUER_NAME}`);
    expect(continued).not.toContain(`This turn runs on ${FAILED_NAME}`);
  });

  it('hands a continued research run a checkpoint that names the model now answering', async () => {
    mocks.runResearchLoop.mockImplementation(
      (
        _processed: unknown,
        _billing: unknown,
        options: {
          failover: { next: (error: unknown) => unknown };
          invocation: { onCheckpoint: (checkpoint: ResearchLoopCheckpoint) => Promise<void> };
        },
      ) =>
        (async function* () {
          options.failover.next(new Error('overloaded'));
          await options.invocation.onCheckpoint({
            stage: 'gathering',
            round: 1,
            iteration: 2,
            startedAtMs: 1,
            nextEventSequence: 4,
            nextOperationOrdinal: 3,
            plan: [],
            sources: [],
            messages: transcript(),
            totalSearches: 1,
            totalFetches: 0,
            rewritesUsed: 0,
            newSourcesPerRound: [1],
            cutShortReason: null,
            lastTurnError: null,
            sensitiveSourceAvailable: false,
            untrustedContentInContext: false,
          });
          yield new Uint8Array();
        })(),
    );

    const result = await executeCloudAgentWorkflowInvocation(
      makeInput({ connectorIds: [], fileSources: [] }),
    );

    expect(result.kind).toBe('continue');
    if (result.kind !== 'continue') return;
    const continued = systemText(result.input.research?.checkpoint?.messages ?? []);
    expect(result.input.processed.chatRequest.model).toBe(RESCUER_MODEL);
    expect(continued).toContain(`This turn runs on ${RESCUER_NAME}`);
    expect(continued).not.toContain(`This turn runs on ${FAILED_NAME}`);
  });
});
