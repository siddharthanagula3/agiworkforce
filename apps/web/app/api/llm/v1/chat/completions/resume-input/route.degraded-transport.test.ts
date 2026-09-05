import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

/**
 * AGI-39 for the MRTR (`input_required`) resume, proved the same way its approval
 * twin is: nothing is mocked between the route and the transport. The Workflow
 * platform is made unavailable and the real `runCloudAgentTurn` chooses. An
 * authorized input resume must still COMPLETE, 200, an SSE body, the collected
 * responses threaded into `runToolLoop`, rather than 503.
 *
 * And every authorization gate must still refuse while it is degraded.
 */

const RUN_ID = '0190a000-0000-7000-8000-000000000001';
const CHECKPOINT_ID = '0190a000-0000-7000-8000-000000000002';
const LEASE_TOKEN = '0190a000-0000-7000-8000-000000000003';
const CONVERSATION_ID = '0190a000-0000-7000-8000-000000000004';

const gateMocks = vi.hoisted(() => ({
  authGate: vi.fn(),
  managedCompute: vi.fn(() => null as unknown),
  organizationPolicy: vi.fn(async () => null as unknown),
  spendLimit: vi.fn(async () => null as unknown),
}));

vi.mock('../lib/auth-gate', () => ({ runAuthGate: gateMocks.authGate }));
vi.mock('@/lib/managed-compute-gate', () => ({
  buildManagedComputeGateResponse: gateMocks.managedCompute,
  buildOrganizationPolicyGateResponse: gateMocks.organizationPolicy,
  buildModelPolicyGateResponse: async () => null,
  buildSpendLimitGateResponse: gateMocks.spendLimit,
}));

const mockProcessRequest = vi.fn();
vi.mock('../lib/request-processor', () => ({
  processRequest: (...args: unknown[]) => mockProcessRequest(...args),
  toManagedSkillFromUserSkill: vi.fn(),
  resolveNativeSearchMaxUses: () => 3,
  extractTextContent: (content: unknown) => (typeof content === 'string' ? content : ''),
}));

const transportMocks = vi.hoisted(() => ({
  workflowStart: vi.fn(),
  attach: vi.fn(async () => undefined),
  runToolLoop: vi.fn(),
  buildStream: vi.fn(),
  autoMemory: vi.fn(async () => undefined),
}));

vi.mock('workflow/api', () => ({ start: transportMocks.workflowStart }));
vi.mock('@/lib/services/cloud-agent-execution-service', () => ({
  attachCloudAgentWorkflow: transportMocks.attach,
}));
vi.mock('../lib/tool-loop', () => ({
  runToolLoop: transportMocks.runToolLoop,
  loadMcpToolDefs: vi.fn(async () => []),
}));
vi.mock('../lib/managed-agent-stream', () => ({
  buildManagedAgentStream: transportMocks.buildStream,
}));
vi.mock('../lib/managed-failover', () => ({
  createFailoverPlan: () => ({ next: () => null }),
}));
vi.mock('@/lib/services/managed-auto-memory-service', () => ({
  recordManagedAutoMemoryTurn: transportMocks.autoMemory,
}));
vi.mock('@/lib/user-connector-tools', () => ({
  loadUserConnectorToolDefs: vi.fn(async () => []),
  makeUserConnectorExecutor: vi.fn(),
}));

const db = { query: vi.fn(), transaction: vi.fn() };
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: vi.fn(async () => ({ db })) }));

const checkpointMocks = vi.hoisted(() => ({
  claim: vi.fn(),
  release: vi.fn(async () => undefined),
  complete: vi.fn(async () => undefined),
}));

vi.mock('@/lib/services/cloud-agent-run-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/cloud-agent-run-service')>()),
  claimCloudAgentInputCheckpoint: checkpointMocks.claim,
  releaseCloudAgentInputCheckpoint: checkpointMocks.release,
  completeCloudAgentApprovalCheckpoint: checkpointMocks.complete,
  isCloudAgentRunCancellationRequested: vi.fn(async () => false),
  saveCloudAgentApprovalCheckpoint: vi.fn(async () => undefined),
  saveCloudAgentInputCheckpoint: vi.fn(async () => undefined),
  appendCloudAgentEvent: vi.fn(async () => ({ state: 'running' })),
  transitionCloudAgentRun: vi.fn(async () => ({ state: 'running' })),
}));

const managedUsageMocks = vi.hoisted(() => ({
  providerStarted: vi.fn(async () => undefined),
  finalizeRequest: vi.fn(async () => ({
    requestStatus: 'released',
    operationResult: 'finalized',
    settlementStatus: 'succeeded',
    actualCostCents: 0,
  })),
}));

vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/managed-usage-request-service')>()),
  markManagedUsageProviderStarted: managedUsageMocks.providerStarted,
  finalizeManagedUsageRequest: managedUsageMocks.finalizeRequest,
}));

import { POST } from './route';

const suspendedMessages = [
  { role: 'user', content: 'create a task' },
  {
    role: 'assistant',
    content: '',
    tool_calls: [
      {
        id: 'call_1',
        type: 'function',
        function: { name: 'mcp__custom-abc123__create_task', arguments: '{"title":"ship it"}' },
      },
    ],
    __canonicalThinking: [{ type: 'thinking', thinking: 'private', signature: 'signed' }],
  },
];

const claimedCheckpoint = {
  checkpoint: {
    id: CHECKPOINT_ID,
    runId: RUN_ID,
    userId: 'user-1',
    version: 2,
    sessionId: CONVERSATION_ID,
    turnId: 'original-turn-1',
    nextEventSequence: 7,
    completedSteps: 1,
    request: {
      model: 'claude-test',
      stream: true,
      conversation_id: CONVERSATION_ID,
      work_mode: 'agiwork',
    },
    messages: suspendedMessages,
    pendingToolCalls: [
      {
        id: 'call_1',
        qualifiedName: 'mcp__custom-abc123__create_task',
        args: { title: 'ship it' },
      },
    ],
    state: 'resuming',
    leaseToken: LEASE_TOKEN,
    leaseExpiresAt: '2026-07-18T00:15:00.000Z',
    resolvedAt: null,
    createdAt: '2026-07-18T00:00:00.000Z',
    updatedAt: '2026-07-18T00:00:00.000Z',
    inputRequests: { call_1: { priority: { type: 'string' } } },
    requestState: { call_1: { requestState: 'token-1', round: 0 } },
  },
  resumptions: [
    {
      toolCallId: 'call_1',
      inputResponses: { priority: 'high' },
      requestState: 'token-1',
      round: 1,
    },
  ],
  leaseToken: LEASE_TOKEN,
};

function processedRequest(
  billing: Record<string, unknown> = {
    managedUsage: {
      db,
      userId: 'user-1',
      idempotencyKey: 'agi.chat.web.tool-input.resume-1',
      requestHash: 'request-hash',
      leaseToken: LEASE_TOKEN,
      estimatedCostCents: 4,
    },
  },
) {
  const publicMessages = suspendedMessages.map(({ __canonicalThinking: _p, ...m }) => m);
  return {
    ok: true,
    requestId: 'resume-request-1',
    organizationId: null,
    conversationId: CONVERSATION_ID,
    provider: 'anthropic',
    requestedModel: 'claude-test',
    originalModel: 'claude-test',
    subscriptionTier: 'pro',
    estimatedCostCents: 4,
    estimatedPromptTokens: 120,
    maxTokens: 4096,
    usedFallback: false,
    resolvedTaskType: 'coding',
    classifierConfidence: 1,
    resolvedSlot: null,
    quotaFeature: 'chat',
    quotaWarningHeader: null,
    isFlagshipRequest: false,
    indicResult: {},
    chatRequest: {
      model: 'claude-test',
      messages: publicMessages,
      stream: true,
      work_mode: 'agiwork',
    },
    llmRequest: { model: 'claude-test', messages: publicMessages, max_tokens: 4096, stream: true },
    ...billing,
  };
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/llm/v1/chat/completions/resume-input', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': 'agi.chat.web.tool-input.resume-1',
      'X-AGI-Origin-Surface': 'web',
    },
    body: JSON.stringify(body),
  });
}

const resumeBody = {
  run_id: RUN_ID,
  tool_inputs: [{ tool_call_id: 'call_1', input_responses: { priority: 'high' } }],
};

function inlineStream(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"delta":"ok"}\n\ndata: [DONE]\n\n'));
      controller.close();
    },
  });
}

function toolLoopOptions(): Record<string, unknown> {
  return transportMocks.runToolLoop.mock.calls[0]![1] as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  db.query.mockResolvedValue([]);
  gateMocks.authGate.mockResolvedValue({
    ok: true,
    userId: 'user-1',
    token: 'tok',
    subscription: { plan_tier: 'pro' },
  });
  gateMocks.managedCompute.mockReturnValue(null);
  gateMocks.organizationPolicy.mockResolvedValue(null);
  gateMocks.spendLimit.mockResolvedValue(null);
  checkpointMocks.claim.mockResolvedValue(claimedCheckpoint);
  mockProcessRequest.mockResolvedValue(processedRequest());
  transportMocks.runToolLoop.mockReturnValue((async function* () {})());
  transportMocks.buildStream.mockImplementation(() => inlineStream());
});

afterEach(() => vi.unstubAllEnvs());

describe('resume-input completes inline when the durable platform is unavailable', () => {
  it('answers 200 with the resumed work, not 503, when the Workflow platform refuses', async () => {
    transportMocks.workflowStart.mockRejectedValue(new Error('workflow storage unavailable'));

    const response = await POST(makeRequest(resumeBody));
    const body = await response.text();

    expect(transportMocks.workflowStart).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(response.headers.get('X-AGI-Agent-Transport')).toBe('inline');
    expect(response.headers.get('X-AGI-Tool-Loop')).toBe('resume-input');
    expect(response.headers.get('X-AGI-Workflow-Run-Id')).toBeNull();
    expect(body).toContain('data: [DONE]');
  });

  it('threads the collected input responses into the inline loop unchanged', async () => {
    transportMocks.workflowStart.mockRejectedValue(new Error('workflow storage unavailable'));

    await (await POST(makeRequest(resumeBody))).text();

    expect(toolLoopOptions()).toMatchObject({
      resume: {
        inputResponses: [
          {
            toolCallId: 'call_1',
            inputResponses: { priority: 'high' },
            requestState: 'token-1',
            round: 1,
          },
        ],
      },
      eventSessionId: CONVERSATION_ID,
      eventTurnId: 'original-turn-1',
      initialEventSequence: 7,
      initialCompletedSteps: 1,
    });
    expect(checkpointMocks.release).not.toHaveBeenCalled();
  });

  it('completes inline with the durable kill-switch engaged, without touching the platform', async () => {
    vi.stubEnv('AGI_DURABLE_INITIAL_TURNS', '0');

    const response = await POST(makeRequest(resumeBody));
    await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('X-AGI-Agent-Transport')).toBe('inline');
    expect(transportMocks.workflowStart).not.toHaveBeenCalled();
    expect(transportMocks.runToolLoop).toHaveBeenCalledOnce();
  });

  it('degrades a FREE turn inline too, and hands the loop the free reservation', async () => {
    transportMocks.workflowStart.mockRejectedValue(new Error('workflow storage unavailable'));
    mockProcessRequest.mockResolvedValue(
      processedRequest({
        freeTrial: {
          kind: 'free_trial',
          userId: 'user-1',
          requestId: 'agi.chat.web.tool-input.resume-1',
          reservedMicrousd: 4_200,
        },
      }),
    );

    const response = await POST(makeRequest(resumeBody));
    await response.text();

    expect(response.status).toBe(200);
    const processed = transportMocks.runToolLoop.mock.calls[0]![0] as Record<string, unknown>;
    expect(processed['freeTrial']).toMatchObject({ kind: 'free_trial', reservedMicrousd: 4_200 });
    expect(processed['managedUsage']).toBeUndefined();
    expect(managedUsageMocks.finalizeRequest).not.toHaveBeenCalled();
  });

  it('still 503s and releases the lease when BOTH transports refuse', async () => {
    transportMocks.workflowStart.mockRejectedValue(new Error('workflow storage unavailable'));
    transportMocks.buildStream.mockImplementation(() => {
      throw new Error('inline transport unavailable too');
    });

    const response = await POST(makeRequest(resumeBody));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'agent_workflow_unavailable' },
    });
    expect(checkpointMocks.release).toHaveBeenCalledWith(db, {
      userId: 'user-1',
      runId: RUN_ID,
      checkpointId: CHECKPOINT_ID,
      leaseToken: LEASE_TOKEN,
    });
  });
});

describe('every authorization gate still refuses on the degraded transport', () => {
  beforeEach(() => {
    transportMocks.workflowStart.mockRejectedValue(new Error('workflow storage unavailable'));
  });

  function expectNoTransportReached() {
    expect(transportMocks.workflowStart).not.toHaveBeenCalled();
    expect(transportMocks.runToolLoop).not.toHaveBeenCalled();
    expect(transportMocks.buildStream).not.toHaveBeenCalled();
    expect(checkpointMocks.claim).not.toHaveBeenCalled();
  }

  it('CSRF: refuses a request whose CSRF token the auth gate rejects', async () => {
    gateMocks.authGate.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 }),
    });

    expect((await POST(makeRequest(resumeBody))).status).toBe(403);
    expectNoTransportReached();
  });

  it('auth: refuses an unauthenticated caller', async () => {
    gateMocks.authGate.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: { code: 'invalid_api_key' } }, { status: 401 }),
    });

    expect((await POST(makeRequest(resumeBody))).status).toBe(401);
    expectNoTransportReached();
  });

  it('managed compute: refuses when managed execution is not entitled', async () => {
    gateMocks.managedCompute.mockReturnValue(
      NextResponse.json({ error: { code: 'managed_compute_disabled' } }, { status: 402 }),
    );

    expect((await POST(makeRequest(resumeBody))).status).toBe(402);
    expectNoTransportReached();
  });

  it('organization policy: refuses a model the workspace policy forbids', async () => {
    gateMocks.organizationPolicy.mockResolvedValue(
      NextResponse.json({ error: { code: 'organization_policy_blocked' } }, { status: 403 }),
    );

    expect((await POST(makeRequest(resumeBody))).status).toBe(403);
    expectNoTransportReached();
  });

  it('spend limit: refuses a workspace that is over budget', async () => {
    gateMocks.spendLimit.mockResolvedValue(
      NextResponse.json({ error: { code: 'spend_limit_exceeded' } }, { status: 402 }),
    );

    expect((await POST(makeRequest(resumeBody))).status).toBe(402);
    expectNoTransportReached();
  });

  it('checkpoint ownership: refuses a run this tenant does not own', async () => {
    const { CloudAgentApprovalCheckpointNotFoundError } =
      await import('@/lib/services/cloud-agent-run-service');
    checkpointMocks.claim.mockRejectedValue(new CloudAgentApprovalCheckpointNotFoundError());

    expect((await POST(makeRequest(resumeBody))).status).toBe(404);
    expect(transportMocks.runToolLoop).not.toHaveBeenCalled();
  });

  it('per-request validation: an inline turn is still refused by the request processor', async () => {
    mockProcessRequest.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'quota exhausted' }, { status: 402 }),
    });

    expect((await POST(makeRequest(resumeBody))).status).toBe(402);
    expect(transportMocks.runToolLoop).not.toHaveBeenCalled();
    expect(checkpointMocks.release).toHaveBeenCalledOnce();
  });
});
