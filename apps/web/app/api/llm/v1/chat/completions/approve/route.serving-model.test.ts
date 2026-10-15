import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import {
  getDefaultAutoRoutingProfile,
  getDefaultModelFor,
  getModelMetadataById,
  getModelRegistryFacts,
  listCanonicalModels,
} from '@agiworkforce/types';
type ScanModule0 = typeof import('../lib/request-processor');
type ScanModule1 = typeof import('../lib/tool-loop');
type ScanModule2 = typeof import('@/lib/user-connector-tools');
type ScanModule3 = typeof import('@/lib/workflows/start-cloud-agent-workflow');
type ScanModule4 = typeof import('@/lib/services/cloud-agent-run-service');
type ScanModule5 = typeof import('@/lib/services/managed-usage-request-service');
type ScanModule6 = typeof import('@/lib/managed-compute-gate');

const RUN_ID = '0190a000-0000-7000-8000-000000000001';
const CHECKPOINT_ID = '0190a000-0000-7000-8000-000000000002';
const LEASE_TOKEN = '0190a000-0000-7000-8000-000000000003';
const CONVERSATION_ID = '0190a000-0000-7000-8000-000000000004';

const mocks = vi.hoisted(() => ({
  authGate: vi.fn(),
  processRequest: vi.fn(),
  runTurn: vi.fn(),
  claim: vi.fn(),
  release: vi.fn(async () => undefined),
}));

vi.mock('../lib/auth-gate', () => ({ runAuthGate: mocks.authGate }));
vi.mock('@/lib/managed-compute-gate', async (importOriginal) => ({
  ...(await importOriginal<ScanModule6>()),
  resolveWorkspaceControlsForRequest: async () => ({ ok: true, controls: null }),
  buildManagedComputeGateResponse: () => null,
  buildOrganizationPolicyGateResponse: async () => null,
  buildSpendLimitGateResponse: async () => null,
}));
vi.mock('../lib/request-processor', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  processRequest: mocks.processRequest,
}));
vi.mock('../lib/tool-loop', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  loadMcpToolDefs: async () => [],
}));
vi.mock('@/lib/user-connector-tools', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  loadUserConnectorToolDefs: async () => [],
}));
vi.mock('@/lib/workflows/start-cloud-agent-workflow', async (importOriginal) => ({
  ...(await importOriginal<ScanModule3>()),
  runCloudAgentTurn: mocks.runTurn,
}));

const db = { query: vi.fn(async () => []), transaction: vi.fn() };
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<RlsDbModule>()),
  getUserScopedDb: async () => ({ db }),
}));
vi.mock('@/lib/services/cloud-agent-run-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule4>()),
  claimCloudAgentApprovalCheckpoint: mocks.claim,
  releaseCloudAgentApprovalCheckpoint: mocks.release,
}));
vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule5>()),
  markManagedUsageProviderStarted: async () => undefined,
  finalizeManagedUsageRequest: async () => undefined,
}));

import { buildApprovalCheckpointRequest } from '../lib/approval-checkpoint-request';
import {
  buildCapabilityPreamble,
  servingModelFor,
  type ModelSelection,
} from '../lib/capability-preamble';
import { buildFailoverAttemptView } from '../lib/managed-failover';
import type { ChatCompletionRequest, ProcessedRequest } from '../lib/request-processor';
import { CHAT_SYSTEM_PROMPT_ID } from '@/lib/prompts/chat-system-prompt';
import { POST } from './route';

type RlsDbModule = typeof import('@/lib/server/rls-db');

function concreteModels(): string[] {
  return listCanonicalModels()
    .map((model) => model.id)
    .filter((id) => getModelRegistryFacts(id)?.isRouter !== true);
}

function nameOf(modelId: string): string {
  return getModelMetadataById(modelId)?.name ?? '';
}

function distinctFrom(...modelIds: string[]): string {
  const names = modelIds.map(nameOf);
  const found = concreteModels().find(
    (id) =>
      !modelIds.includes(id) &&
      names.every((name) => !nameOf(id).includes(name) && !name.includes(nameOf(id))),
  );
  if (!found) throw new Error('the catalog holds too few distinct concrete models');
  return found;
}

const ROUTED_MODEL = getDefaultModelFor('pro', 'chat');
const FAILOVER_MODEL = distinctFrom(ROUTED_MODEL);
const RESUMED_MODEL = distinctFrom(ROUTED_MODEL, FAILOVER_MODEL);
const AUTO_SELECTION: ModelSelection = {
  kind: 'picked',
  modelId: getDefaultAutoRoutingProfile().id,
};
const NOW = new Date('2026-10-02T12:00:00.000Z');

function systemPromptFor(modelId: string): string {
  return String(
    buildCapabilityPreamble({
      now: NOW,
      tools: [],
      surface: 'web',
      promptSelection: { variants: { [CHAT_SYSTEM_PROMPT_ID]: 9 } },
      servingModel: servingModelFor(modelId, AUTO_SELECTION),
    }),
  );
}

const suspendedMessages = [
  { role: 'system', content: systemPromptFor(ROUTED_MODEL) },
  { role: 'user', content: 'Read my latest email and tell me which model you are.' },
  {
    role: 'assistant',
    content: '',
    tool_calls: [
      {
        id: 'call_1',
        type: 'function',
        function: { name: 'mcp__gmail__search_threads', arguments: '{}' },
      },
    ],
  },
];

function claimedCheckpoint() {
  return {
    checkpoint: {
      id: CHECKPOINT_ID,
      runId: RUN_ID,
      userId: 'user-1',
      version: 1,
      sessionId: CONVERSATION_ID,
      turnId: 'original-turn-1',
      nextEventSequence: 6,
      completedSteps: 1,
      request: buildApprovalCheckpointRequest(
        {
          model: ROUTED_MODEL,
          messages: [],
          stream: true,
          conversation_id: CONVERSATION_ID,
          work_mode: 'agiwork',
        } as unknown as ChatCompletionRequest,
        {},
        [],
        AUTO_SELECTION,
      ),
      messages: suspendedMessages,
      pendingToolCalls: [{ id: 'call_1', qualifiedName: 'mcp__gmail__search_threads', args: {} }],
      state: 'resuming',
      leaseToken: LEASE_TOKEN,
      leaseExpiresAt: '2026-10-03T12:00:00.000Z',
      resolvedAt: null,
      createdAt: '2026-10-02T12:00:00.000Z',
      updatedAt: '2026-10-02T12:00:00.000Z',
    },
    approvals: [{ toolCallId: 'call_1', decision: 'approved' as const }],
    leaseToken: LEASE_TOKEN,
  };
}

function resumedRequest(model: string) {
  return {
    ok: true,
    requestId: 'resume-request-1',
    conversationId: CONVERSATION_ID,
    provider: 'anthropic',
    requestedModel: model,
    originalModel: model,
    subscriptionTier: 'pro',
    modelSelection: { kind: 'picked', modelId: model },
    chatRequest: { model, messages: [], stream: true, work_mode: 'agiwork' },
    llmRequest: { model, messages: [], max_tokens: 4096, stream: true },
    quotaWarningHeader: null,
  };
}

function approve(): NextRequest {
  return new NextRequest('http://localhost/api/llm/v1/chat/completions/approve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': 'agi.chat.web.tool-resume.resume-1',
      'X-AGI-Origin-Surface': 'web',
    },
    body: JSON.stringify({
      run_id: RUN_ID,
      tool_approvals: [{ tool_call_id: 'call_1', decision: 'approved' }],
    }),
  });
}

function systemText(messages: ReadonlyArray<{ role: string; content: unknown }>): string {
  return messages
    .filter((message) => message.role === 'system')
    .map((message) => String(message.content))
    .join('\n\n');
}

async function resumedTurn(): Promise<ProcessedRequest> {
  const response = await POST(approve());
  await response.text();
  expect(response.status).toBe(200);
  return (mocks.runTurn.mock.calls[0]![0] as { processed: ProcessedRequest }).processed;
}

describe('an approved turn that fails over after it resumes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.query.mockResolvedValue([]);
    mocks.authGate.mockResolvedValue({
      ok: true,
      userId: 'user-1',
      token: 'tok',
      subscription: { plan_tier: 'pro' },
    });
    mocks.claim.mockResolvedValue(claimedCheckpoint());
    mocks.processRequest.mockResolvedValue(resumedRequest(ROUTED_MODEL));
    mocks.runTurn.mockResolvedValue({
      transport: 'inline',
      readable: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          controller.close();
        },
      }),
    });
  });

  it('tells the failover model it is the one answering, under the Auto selection the user made', async () => {
    const processed = await resumedTurn();

    const attempt = buildFailoverAttemptView(processed, FAILOVER_MODEL, 'openai');

    expect(systemText(attempt.llmRequest.messages)).toBe(systemPromptFor(FAILOVER_MODEL));
    expect(systemText(attempt.llmRequest.messages)).not.toContain(nameOf(ROUTED_MODEL));
  });

  it('names the model the resumed run starts on when routing moved it off the rendered one', async () => {
    mocks.processRequest.mockResolvedValue(resumedRequest(RESUMED_MODEL));

    const processed = await resumedTurn();

    expect(processed.modelSelection).toEqual(AUTO_SELECTION);
    expect(systemText(processed.llmRequest.messages)).toBe(systemPromptFor(RESUMED_MODEL));
  });
});
