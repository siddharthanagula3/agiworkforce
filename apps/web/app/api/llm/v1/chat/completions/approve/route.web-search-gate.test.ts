import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const RUN_ID = '0190a000-0000-7000-8000-000000000001';
const CHECKPOINT_ID = '0190a000-0000-7000-8000-000000000002';
const LEASE_TOKEN = '0190a000-0000-7000-8000-000000000003';
const CONVERSATION_ID = '0190a000-0000-7000-8000-000000000004';

const mockRunAuthGate = vi.fn();
vi.mock('../lib/auth-gate', () => ({
  runAuthGate: (...args: unknown[]) => mockRunAuthGate(...args),
}));

vi.mock('@/lib/managed-compute-gate', () => ({
  buildManagedComputeGateResponse: vi.fn(() => null),
  buildOrganizationPolicyGateResponse: vi.fn(async () => null),
  buildModelPolicyGateResponse: async () => null,
  buildSpendLimitGateResponse: vi.fn(async () => null),
}));

const mockProcessRequest = vi.fn();
vi.mock('../lib/request-processor', () => ({
  processRequest: (...args: unknown[]) => mockProcessRequest(...args),
  toManagedSkillFromUserSkill: vi.fn(),
  resolveNativeSearchMaxUses: () => 3,
  extractTextContent: (content: unknown) => (typeof content === 'string' ? content : ''),
}));

vi.mock('../lib/tool-loop', () => ({
  runToolLoop: vi.fn(),
  loadMcpToolDefs: vi.fn(async () => []),
}));

vi.mock('@/lib/user-connector-tools', () => ({
  loadUserConnectorToolDefs: vi.fn(async () => []),
  makeUserConnectorExecutor: vi.fn(),
}));

const policyMocks = vi.hoisted(() => ({ load: vi.fn(async () => 'ask_every_time') }));
vi.mock('../lib/tool-approval-policy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/tool-approval-policy')>()),
  loadToolApprovalPolicy: policyMocks.load,
}));

const workflowMocks = vi.hoisted(() => ({ start: vi.fn() }));
vi.mock('@/lib/workflows/start-cloud-agent-workflow', () => ({
  runCloudAgentTurn: workflowMocks.start,
}));

const db = { query: vi.fn(), transaction: vi.fn() };
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({ db })),
}));

const checkpointMocks = vi.hoisted(() => ({
  claim: vi.fn(),
  save: vi.fn(async () => undefined),
  complete: vi.fn(async () => undefined),
  release: vi.fn(async () => undefined),
  isCancelled: vi.fn(async () => false),
}));
vi.mock('@/lib/services/cloud-agent-run-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/cloud-agent-run-service')>()),
  claimCloudAgentApprovalCheckpoint: checkpointMocks.claim,
  saveCloudAgentApprovalCheckpoint: checkpointMocks.save,
  completeCloudAgentApprovalCheckpoint: checkpointMocks.complete,
  releaseCloudAgentApprovalCheckpoint: checkpointMocks.release,
  isCloudAgentRunCancellationRequested: checkpointMocks.isCancelled,
  appendCloudAgentEvent: vi.fn(async () => ({ state: 'running' })),
  transitionCloudAgentRun: vi.fn(async () => ({ state: 'running' })),
}));

vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/managed-usage-request-service')>()),
  markManagedUsageProviderStarted: vi.fn(async () => undefined),
  markManagedUsageClientDelivered: vi.fn(async () => undefined),
  finalizeManagedUsageRequest: vi.fn(async () => ({ actualCostCents: 0 })),
}));

import { POST } from './route';

const NATIVE_SEARCH_TOOL = { type: 'web_search_20260209', name: 'web_search', max_uses: 5 };
const UNRELATED_TOOL = {
  type: 'function',
  function: { name: 'get_weather', parameters: { type: 'object' } },
};

const suspendedMessages = [
  { role: 'user', content: 'what shipped today' },
  {
    role: 'assistant',
    content: '',
    tool_calls: [
      {
        id: 'call_1',
        type: 'function',
        function: { name: 'mcp__github__get_pull_request_diff', arguments: '{}' },
      },
    ],
  },
];

const claimedCheckpoint = {
  checkpoint: {
    id: CHECKPOINT_ID,
    runId: RUN_ID,
    userId: 'user-1',
    version: 1,
    sessionId: CONVERSATION_ID,
    turnId: 'original-turn-1',
    nextEventSequence: 6,
    completedSteps: 1,
    request: {
      model: 'claude-test',
      stream: true,
      conversation_id: CONVERSATION_ID,
      tools: [NATIVE_SEARCH_TOOL],
    },
    messages: suspendedMessages,
    pendingToolCalls: [
      { id: 'call_1', qualifiedName: 'mcp__github__get_pull_request_diff', args: {} },
    ],
    state: 'resuming',
    leaseToken: LEASE_TOKEN,
    leaseExpiresAt: '2026-07-18T00:15:00.000Z',
    resolvedAt: null,
    createdAt: '2026-07-18T00:00:00.000Z',
    updatedAt: '2026-07-18T00:00:00.000Z',
  },
  approvals: [{ toolCallId: 'call_1', decision: 'approved' as const }],
  leaseToken: LEASE_TOKEN,
};

function makeRequest(): NextRequest {
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

function resumedTools(): unknown[] | undefined {
  const call = workflowMocks.start.mock.calls[0]?.[0] as
    { processed: { llmRequest: { tools?: unknown[] } } } | undefined;
  return call?.processed.llmRequest.tools;
}

describe('approve route, provider-native search under an approval policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    policyMocks.load.mockResolvedValue('ask_every_time');
    db.query.mockResolvedValue([]);
    mockRunAuthGate.mockResolvedValue({
      ok: true,
      userId: 'user-1',
      token: 'tok',
      subscription: { plan_tier: 'pro' },
    });
    checkpointMocks.claim.mockResolvedValue(claimedCheckpoint);
    mockProcessRequest.mockImplementation(async () => ({
      ok: true,
      requestId: 'resume-request-1',
      conversationId: CONVERSATION_ID,
      provider: 'anthropic',
      requestedModel: 'claude-test',
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
      workflowRunId: 'wrun_resume_1',
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

    const response = await POST(makeRequest());
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

    const response = await POST(makeRequest());
    await response.text();

    expect(resumedTools()).toEqual([UNRELATED_TOOL]);
  });

  it('leaves the tool list alone when the policy auto-approves a search', async () => {
    policyMocks.load.mockResolvedValue('autonomous');
    vi.stubEnv('PERPLEXITY_API_KEY', 'pplx-test-key');

    const response = await POST(makeRequest());
    await response.text();

    expect(resumedTools()).toEqual([UNRELATED_TOOL, NATIVE_SEARCH_TOOL]);
  });
});
