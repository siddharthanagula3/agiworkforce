import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const RUN_ID = '0190a000-0000-7000-8000-000000000001';
const CHECKPOINT_ID = '0190a000-0000-7000-8000-000000000002';
const LEASE_TOKEN = '0190a000-0000-7000-8000-000000000003';
const CONVERSATION_ID = '0190a000-0000-7000-8000-000000000004';

const mockRunAuthGate = vi.fn();
vi.mock('../lib/auth-gate', () => ({
  runAuthGate: (...args: unknown[]) => mockRunAuthGate(...args),
}));

const gateMocks = vi.hoisted(() => ({
  managedCompute: vi.fn(() => null as unknown),
  orgPolicy: vi.fn(async () => null as unknown),
  spendLimit: vi.fn(async () => null as unknown),
}));

vi.mock('@/lib/managed-compute-gate', () => ({
  buildManagedComputeGateResponse: gateMocks.managedCompute,
  buildOrganizationPolicyGateResponse: gateMocks.orgPolicy,
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

const mockRunToolLoop = vi.fn();
const toolMocks = vi.hoisted(() => ({
  loadOperatorTools: vi.fn(async () => []),
  loadConnectorTools: vi.fn(async () => []),
}));
vi.mock('../lib/tool-loop', () => ({
  runToolLoop: (...args: unknown[]) => mockRunToolLoop(...args),
  loadMcpToolDefs: toolMocks.loadOperatorTools,
}));

vi.mock('@/lib/user-connector-tools', () => ({
  loadUserConnectorToolDefs: toolMocks.loadConnectorTools,
  makeUserConnectorExecutor: vi.fn(),
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
  release: vi.fn(async () => undefined),
}));

vi.mock('@/lib/services/cloud-agent-run-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/cloud-agent-run-service')>()),
  claimCloudAgentInputCheckpoint: checkpointMocks.claim,
  releaseCloudAgentInputCheckpoint: checkpointMocks.release,
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

import {
  CloudAgentInputResponseError,
  CloudAgentApprovalCheckpointNotFoundError,
  CloudAgentApprovalCheckpointExpiredError,
} from '@/lib/services/cloud-agent-run-service';
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

function resumeBody(toolCallId = 'call_1') {
  return {
    run_id: RUN_ID,
    tool_inputs: [{ tool_call_id: toolCallId, input_responses: { priority: 'high' } }],
  };
}

function processedRequest() {
  return {
    ok: true,
    requestId: 'resume-request-1',
    conversationId: CONVERSATION_ID,
    provider: 'anthropic',
    requestedModel: 'claude-test',
    subscriptionTier: 'pro',
    chatRequest: {
      model: 'claude-test',
      messages: suspendedMessages.map(({ __canonicalThinking: _p, ...message }) => message),
      stream: true,
      work_mode: 'agiwork',
    },
    llmRequest: {
      model: 'claude-test',
      messages: suspendedMessages.map(({ __canonicalThinking: _p, ...message }) => message),
      max_tokens: 4096,
      stream: true,
    },
    quotaWarningHeader: null,
    managedUsage: {
      db,
      userId: 'user-1',
      idempotencyKey: 'agi.chat.web.tool-input.resume-1',
      requestHash: 'request-hash',
      leaseToken: LEASE_TOKEN,
      estimatedCostCents: 4,
    },
  };
}

describe('POST /api/llm/v1/chat/completions/resume-input, durable MRTR boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gateMocks.managedCompute.mockReturnValue(null);
    gateMocks.orgPolicy.mockResolvedValue(null);
    gateMocks.spendLimit.mockResolvedValue(null);
    db.query.mockResolvedValue([]);
    mockRunAuthGate.mockResolvedValue({
      ok: true,
      userId: 'user-1',
      token: 'tok',
      subscription: { plan_tier: 'pro' },
    });
    checkpointMocks.claim.mockResolvedValue(claimedCheckpoint);
    mockProcessRequest.mockResolvedValue(processedRequest());
    workflowMocks.start.mockResolvedValue({
      transport: 'durable',
      workflowRunId: 'wrun_input_1',
      readable: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          controller.close();
        },
      }),
    });
    mockRunToolLoop.mockReturnValue(
      (async function* () {
        yield new TextEncoder().encode('data: [DONE]\n\n');
      })(),
    );
  });

  it('rejects a malformed body before claiming a checkpoint', async () => {
    const response = await POST(makeRequest({ tool_inputs: [] }));

    expect(response.status).toBe(400);
    expect(checkpointMocks.claim).not.toHaveBeenCalled();
    expect(mockProcessRequest).not.toHaveBeenCalled();
  });

  it('rejects a forged tool call id against the server-owned pending set', async () => {
    checkpointMocks.claim.mockRejectedValue(new CloudAgentInputResponseError());

    const response = await POST(makeRequest(resumeBody('call_forged')));

    expect(response.status).toBe(400);
    expect(mockProcessRequest).not.toHaveBeenCalled();
    expect(workflowMocks.start).not.toHaveBeenCalled();
  });

  it('does not disclose a run without a tenant-owned pending input checkpoint', async () => {
    checkpointMocks.claim.mockRejectedValue(new CloudAgentApprovalCheckpointNotFoundError());

    const response = await POST(makeRequest(resumeBody()));

    expect(response.status).toBe(404);
    expect(mockProcessRequest).not.toHaveBeenCalled();
  });

  it('rejects an expired input checkpoint with 410', async () => {
    checkpointMocks.claim.mockRejectedValue(new CloudAgentApprovalCheckpointExpiredError());

    const response = await POST(makeRequest(resumeBody()));

    expect(response.status).toBe(410);
    expect(workflowMocks.start).not.toHaveBeenCalled();
  });

  it('rebuilds validation from trusted state and threads the collected responses into the continuation', async () => {
    const response = await POST(makeRequest(resumeBody()));
    await response.text();

    const syntheticRequest = mockProcessRequest.mock.calls[0]![0] as NextRequest;
    const syntheticBody = (await syntheticRequest.json()) as Record<string, unknown>;
    expect(syntheticBody).toMatchObject({ model: 'claude-test', conversation_id: CONVERSATION_ID });
    expect(syntheticBody).not.toHaveProperty('run_id');
    expect(syntheticBody).not.toHaveProperty('tool_inputs');
    expect(JSON.stringify(syntheticBody)).not.toContain('__canonicalThinking');
    // The user's raw responses never leak back into request validation.
    expect(JSON.stringify(syntheticBody)).not.toContain('input_responses');

    expect(checkpointMocks.claim).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        runId: RUN_ID,
        inputs: [{ toolCallId: 'call_1', inputResponses: { priority: 'high' } }],
        leaseSeconds: 86_400,
      }),
    );
    expect(workflowMocks.start).toHaveBeenCalledWith(
      expect.objectContaining({
        db,
        runId: RUN_ID,
        userId: 'user-1',
        continuation: {
          eventSessionId: CONVERSATION_ID,
          eventTurnId: 'original-turn-1',
          initialEventSequence: 7,
          initialCompletedSteps: 1,
          invocationContinuation: false,
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
        },
        predecessorApproval: { checkpointId: CHECKPOINT_ID, leaseToken: LEASE_TOKEN },
      }),
    );
    expect(response.headers.get('X-AGI-Agent-Run-Id')).toBe(RUN_ID);
    expect(response.headers.get('X-AGI-Workflow-Run-Id')).toBe('wrun_input_1');
    expect(response.headers.get('X-AGI-Tool-Loop')).toBe('resume-input');
  });

  it('releases the checkpoint lease when current request validation cannot proceed', async () => {
    mockProcessRequest.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'quota changed' }, { status: 402 }),
    });

    const response = await POST(makeRequest(resumeBody()));

    expect(response.status).toBe(402);
    expect(checkpointMocks.release).toHaveBeenCalledWith(db, {
      userId: 'user-1',
      runId: RUN_ID,
      checkpointId: CHECKPOINT_ID,
      leaseToken: LEASE_TOKEN,
    });
  });

  /**
   * AGI-39, the MRTR half. This route had the same unconditional durable start
   * as `approve/`, so an outage or an engaged kill-switch failed an authorized
   * input resume permanently.
   */
  describe('degraded transport still serves an authorized input resume', () => {
    beforeEach(() => {
      workflowMocks.start.mockResolvedValue({
        transport: 'inline',
        workflowRunId: null,
        degradedReason: 'kill_switch',
        readable: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
            controller.close();
          },
        }),
      });
    });

    it('answers 200 with the resumed stream rather than 503', async () => {
      const response = await POST(makeRequest(resumeBody()));

      expect(response.status).toBe(200);
      expect(response.headers.get('X-AGI-Tool-Loop')).toBe('resume-input');
      expect(response.headers.get('X-AGI-Agent-Run-Id')).toBe(RUN_ID);
      await expect(response.text()).resolves.toContain('[DONE]');
    });

    it('advertises no workflow run to reattach to, and names the transport', async () => {
      const response = await POST(makeRequest(resumeBody()));
      await response.text();

      expect(response.headers.get('X-AGI-Workflow-Run-Id')).toBeNull();
      expect(response.headers.get('X-AGI-Agent-Transport')).toBe('inline');
    });

    it('asks the transport for the inline fallback, not durable-only', async () => {
      await (await POST(makeRequest(resumeBody()))).text();

      expect(workflowMocks.start).toHaveBeenCalledWith(
        expect.objectContaining({ onDurableUnavailable: 'inline' }),
      );
    });

    it('keeps the checkpoint lease claimed, because the resume really ran', async () => {
      await (await POST(makeRequest(resumeBody()))).text();

      expect(checkpointMocks.release).not.toHaveBeenCalled();
    });
  });

  /** Degrading the TRANSPORT must never degrade AUTHORIZATION. */
  describe('authorization gates still refuse, whichever transport would serve', () => {
    it('refuses an unauthenticated caller before claiming anything', async () => {
      mockRunAuthGate.mockResolvedValue({
        ok: false,
        response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }),
      });

      const response = await POST(makeRequest(resumeBody()));

      expect(response.status).toBe(401);
      expect(checkpointMocks.claim).not.toHaveBeenCalled();
      expect(workflowMocks.start).not.toHaveBeenCalled();
    });

    it('refuses when managed compute is unavailable to this caller', async () => {
      gateMocks.managedCompute.mockReturnValue(
        NextResponse.json({ error: 'managed compute disabled' }, { status: 403 }),
      );

      const response = await POST(makeRequest(resumeBody()));

      expect(response.status).toBe(403);
      expect(checkpointMocks.claim).not.toHaveBeenCalled();
      expect(workflowMocks.start).not.toHaveBeenCalled();
    });

    it('refuses when workspace policy forbids the turn', async () => {
      gateMocks.orgPolicy.mockResolvedValue(
        NextResponse.json({ error: 'blocked by policy' }, { status: 403 }),
      );

      const response = await POST(makeRequest(resumeBody()));

      expect(response.status).toBe(403);
      expect(checkpointMocks.claim).not.toHaveBeenCalled();
      expect(workflowMocks.start).not.toHaveBeenCalled();
    });

    it('refuses when the workspace spend cap is reached', async () => {
      gateMocks.spendLimit.mockResolvedValue(
        NextResponse.json({ error: 'spend limit reached' }, { status: 402 }),
      );

      const response = await POST(makeRequest(resumeBody()));

      expect(response.status).toBe(402);
      expect(checkpointMocks.claim).not.toHaveBeenCalled();
      expect(workflowMocks.start).not.toHaveBeenCalled();
    });
  });
});
