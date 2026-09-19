import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const RUN_ID = '0190a000-0000-7000-8000-000000000001';
const CHECKPOINT_ID = '0190a000-0000-7000-8000-000000000002';
const LEASE_TOKEN = '0190a000-0000-7000-8000-000000000003';
const CONVERSATION_ID = '0190a000-0000-7000-8000-000000000004';

const mockRunAuthGate = vi.fn();
vi.mock('../../../lib/auth-gate', () => ({
  runAuthGate: (...args: unknown[]) => mockRunAuthGate(...args),
}));

vi.mock('../../../lib/turn-slot', () => ({
  withManagedTurnSlot: (_slot: unknown, run: () => Promise<Response>) => run(),
}));

vi.mock('@/lib/managed-compute-gate', () => ({
  buildManagedComputeGateResponse: vi.fn(() => null),
  buildOrganizationPolicyGateResponse: vi.fn(async () => null),
  buildModelPolicyGateResponse: async () => null,
  buildSpendLimitGateResponse: vi.fn(async () => null),
}));

const mockProcessRequest = vi.fn();
vi.mock('../../../lib/request-processor', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/request-processor')>()),
  processRequest: (...args: unknown[]) => mockProcessRequest(...args),
}));

vi.mock('../../../lib/tool-loop', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/tool-loop')>()),
  loadMcpToolDefs: vi.fn(async () => []),
}));

vi.mock('@/lib/user-connector-tools', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/user-connector-tools')>()),
  loadUserConnectorToolDefs: vi.fn(async () => []),
  makeUserConnectorExecutor: vi.fn(),
}));

vi.mock('../../../lib/connector-tool-permissions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/connector-tool-permissions')>()),
  loadConnectorToolPermissions: vi.fn(async () => ({
    isDenied: () => false,
    isConnectorToolDenied: () => false,
  })),
}));

const policyMocks = vi.hoisted(() => ({ load: vi.fn(async () => 'ask_every_time') }));
vi.mock('../../../lib/tool-approval-policy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/tool-approval-policy')>()),
  loadToolApprovalPolicy: policyMocks.load,
}));

vi.mock('../../../lib/secret-handling-gate', () => ({
  applySecretHandlingToTexts: vi.fn(async (_userId: string, texts: string[]) => ({
    action: 'allowed',
    texts,
  })),
}));

const workflowMocks = vi.hoisted(() => ({ start: vi.fn() }));
vi.mock('@/lib/workflows/start-cloud-agent-workflow', () => ({
  runCloudAgentTurn: workflowMocks.start,
}));

const db = { query: vi.fn(), transaction: vi.fn() };
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({ db, userId: 'user-1' })),
}));

const runMocks = vi.hoisted(() => ({
  withdraw: vi.fn(),
  claim: vi.fn(),
  release: vi.fn(async () => undefined),
}));
vi.mock('@/lib/services/cloud-agent-run-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/cloud-agent-run-service')>()),
  withdrawCloudAgentRunPauseRequest: runMocks.withdraw,
  claimCloudAgentPauseCheckpoint: runMocks.claim,
  releaseCloudAgentPauseCheckpoint: runMocks.release,
}));

vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/managed-usage-request-service')>()),
  markManagedUsageProviderStarted: vi.fn(async () => undefined),
  finalizeManagedUsageRequest: vi.fn(async () => ({ actualCostCents: 0 })),
}));

import { POST } from './route';

const NATIVE_SEARCH_TOOL = { type: 'web_search_20260209', name: 'web_search', max_uses: 5 };
const UNRELATED_TOOL = {
  type: 'function',
  function: { name: 'get_weather', parameters: { type: 'object' } },
};

const claim = {
  checkpoint: {
    id: CHECKPOINT_ID,
    runId: RUN_ID,
    userId: 'user-1',
    version: 1,
    sessionId: CONVERSATION_ID,
    turnId: 'original-turn-1',
    nextEventSequence: 9,
    completedSteps: 3,
    request: { model: 'claude-test', stream: true, tools: [NATIVE_SEARCH_TOOL] },
    messages: [{ role: 'user', content: 'what shipped today' }],
    pendingToolCalls: [],
    state: 'resuming',
    leaseToken: LEASE_TOKEN,
    leaseExpiresAt: '2026-09-17T00:15:00.000Z',
    resolvedAt: null,
    createdAt: '2026-09-16T23:00:00.000Z',
    updatedAt: '2026-09-16T23:00:00.000Z',
  },
  leaseToken: LEASE_TOKEN,
};

const context = { params: Promise.resolve({ runId: RUN_ID }) };

function makeRequest(): NextRequest {
  return new NextRequest(`http://localhost/api/llm/v1/chat/completions/runs/${RUN_ID}/resume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-AGI-Origin-Surface': 'web' },
    body: JSON.stringify({}),
  });
}

function resumedTools(): unknown[] | undefined {
  const call = workflowMocks.start.mock.calls[0]?.[0] as
    { processed: { llmRequest: { tools?: unknown[] } } } | undefined;
  return call?.processed.llmRequest.tools;
}

describe('resume route, provider-native search under an approval policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    policyMocks.load.mockResolvedValue('ask_every_time');
    mockRunAuthGate.mockResolvedValue({
      ok: true,
      userId: 'user-1',
      token: 'tok',
      subscription: { plan_tier: 'pro' },
    });
    runMocks.withdraw.mockResolvedValue(null);
    runMocks.claim.mockResolvedValue(claim);
    mockProcessRequest.mockImplementation(async () => ({
      ok: true,
      requestId: 'resume-request-1',
      provider: 'anthropic',
      subscriptionTier: 'pro',
      chatRequest: { model: 'claude-test', messages: [], stream: true },
      llmRequest: {
        model: 'claude-test',
        messages: [],
        max_tokens: 4096,
        stream: true,
        tools: [UNRELATED_TOOL, NATIVE_SEARCH_TOOL],
      },
      quotaWarningHeader: null,
    }));
    workflowMocks.start.mockResolvedValue({
      transport: 'durable',
      workflowRunId: 'wrun_pause_1',
      readable: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          controller.close();
        },
      }),
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('withdraws the native search the checkpoint carried and offers the gated one', async () => {
    vi.stubEnv('PERPLEXITY_API_KEY', 'pplx-test-key');

    const response = await POST(makeRequest(), context);
    await response.text();

    const tools = resumedTools();
    expect(tools).toBeDefined();
    expect(tools).toContainEqual(UNRELATED_TOOL);
    expect(tools).not.toContainEqual(NATIVE_SEARCH_TOOL);
    expect(
      tools?.some(
        (tool) =>
          (tool as { function?: { name?: string } }).function?.name === 'web_search' &&
          (tool as { type?: string }).type === 'function',
      ),
    ).toBe(true);
  });

  it('withdraws it with no replacement when the gated backend is unconfigured', async () => {
    vi.stubEnv('PERPLEXITY_API_KEY', '');

    const response = await POST(makeRequest(), context);
    await response.text();

    expect(resumedTools()).toEqual([UNRELATED_TOOL]);
  });

  it('leaves the tool list alone when the policy auto-approves a search', async () => {
    policyMocks.load.mockResolvedValue('autonomous');
    vi.stubEnv('PERPLEXITY_API_KEY', 'pplx-test-key');

    const response = await POST(makeRequest(), context);
    await response.text();

    expect(resumedTools()).toEqual([UNRELATED_TOOL, NATIVE_SEARCH_TOOL]);
  });
});
