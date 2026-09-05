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

const managedUsageMocks = vi.hoisted(() => ({
  providerStarted: vi.fn(async () => undefined),
  finalizeRequest: vi.fn(async () => ({
    requestStatus: 'released',
    operationResult: 'finalized',
    settlementStatus: 'succeeded',
    actualCostCents: 0,
  })),
  finalizeObserved: vi.fn(async () => ({
    requestStatus: 'completed',
    operationResult: 'finalized',
    settlementStatus: 'succeeded',
    actualCostCents: 3,
  })),
  delivered: vi.fn(async () => undefined),
}));

vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/managed-usage-request-service')>()),
  markManagedUsageProviderStarted: managedUsageMocks.providerStarted,
  markManagedUsageClientDelivered: managedUsageMocks.delivered,
  finalizeManagedUsageRequest: managedUsageMocks.finalizeRequest,
}));

vi.mock('@/lib/services/managed-usage-accounting-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/managed-usage-accounting-service')>()),
  finalizeObservedManagedUsage: managedUsageMocks.finalizeObserved,
}));

import {
  CloudAgentApprovalDecisionError,
  CloudAgentApprovalCheckpointNotFoundError,
} from '@/lib/services/cloud-agent-run-service';
import { POST } from './route';

const suspendedMessages = [
  { role: 'user', content: 'summarize PR 7' },
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
    __canonicalThinking: [{ type: 'thinking', thinking: 'private', signature: 'signed' }],
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
      work_mode: 'agiwork',
    },
    messages: suspendedMessages,
    pendingToolCalls: [
      {
        id: 'call_1',
        qualifiedName: 'mcp__github__get_pull_request_diff',
        args: {},
      },
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

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/llm/v1/chat/completions/approve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': 'agi.chat.web.tool-resume.resume-1',
      'X-AGI-Origin-Surface': 'web',
    },
    body: JSON.stringify(body),
  });
}

function resumeBody(toolCallId = 'call_1') {
  return {
    run_id: RUN_ID,
    tool_approvals: [{ tool_call_id: toolCallId, decision: 'approved' }],
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
      messages: suspendedMessages.map(({ __canonicalThinking: _private, ...message }) => message),
      stream: true,
      work_mode: 'agiwork',
      thinking_mode: true,
      thinking: { type: 'enabled' },
    },
    llmRequest: {
      model: 'claude-test',
      messages: suspendedMessages.map(({ __canonicalThinking: _private, ...message }) => message),
      max_tokens: 4096,
      stream: true,
      thinking_mode: true,
      thinking: { type: 'enabled', budget_tokens: 1024 },
      effort: 'high',
    },
    quotaWarningHeader: null,
    managedUsage: {
      db,
      userId: 'user-1',
      idempotencyKey: 'agi.chat.web.tool-resume.resume-1',
      requestHash: 'request-hash',
      leaseToken: LEASE_TOKEN,
      estimatedCostCents: 4,
    },
  };
}

describe('POST /api/llm/v1/chat/completions/approve, durable checkpoint boundary', () => {
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
      workflowRunId: 'wrun_resume_1',
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
    const response = await POST(makeRequest({ tool_approvals: [] }));

    expect(response.status).toBe(400);
    expect(checkpointMocks.claim).not.toHaveBeenCalled();
    expect(mockProcessRequest).not.toHaveBeenCalled();
  });

  it('rejects a forged decision from the server-owned pending-call set', async () => {
    checkpointMocks.claim.mockRejectedValue(new CloudAgentApprovalDecisionError());

    const response = await POST(makeRequest(resumeBody('call_forged')));

    expect(response.status).toBe(400);
    expect(mockProcessRequest).not.toHaveBeenCalled();
    expect(workflowMocks.start).not.toHaveBeenCalled();
  });

  it('does not disclose a run that has no tenant-owned pending checkpoint', async () => {
    checkpointMocks.claim.mockRejectedValue(new CloudAgentApprovalCheckpointNotFoundError());

    const response = await POST(makeRequest(resumeBody()));

    expect(response.status).toBe(404);
    expect(mockProcessRequest).not.toHaveBeenCalled();
  });

  it('rebuilds request validation from trusted state and restores the durable event cursor', async () => {
    const response = await POST(makeRequest(resumeBody()));
    await response.text();

    const syntheticRequest = mockProcessRequest.mock.calls[0]![0] as NextRequest;
    const syntheticBody = (await syntheticRequest.json()) as Record<string, unknown>;
    expect(syntheticBody).toMatchObject({
      model: 'claude-test',
      stream: true,
      conversation_id: CONVERSATION_ID,
      work_mode: 'agiwork',
    });
    expect(syntheticBody).not.toHaveProperty('run_id');
    expect(syntheticBody).not.toHaveProperty('tool_approvals');
    expect(JSON.stringify(syntheticBody)).not.toContain('__canonicalThinking');

    expect(checkpointMocks.claim).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ leaseSeconds: 86_400 }),
    );
    expect(toolMocks.loadConnectorTools).toHaveBeenCalledWith('user-1', {
      customConnectorLimit: 25,
      planTier: 'pro',
      isToolDenied: expect.any(Function),
    });
    expect(workflowMocks.start).toHaveBeenCalledWith(
      expect.objectContaining({
        db,
        runId: RUN_ID,
        userId: 'user-1',
        processed: expect.objectContaining({
          llmRequest: expect.objectContaining({ messages: suspendedMessages }),
        }),
        continuation: {
          eventSessionId: CONVERSATION_ID,
          eventTurnId: 'original-turn-1',
          initialEventSequence: 6,
          initialCompletedSteps: 1,
          invocationContinuation: false,
          resume: { approvals: [{ toolCallId: 'call_1', decision: 'approved' }] },
        },
        predecessorApproval: { checkpointId: CHECKPOINT_ID, leaseToken: LEASE_TOKEN },
      }),
    );
    expect(response.headers.get('X-AGI-Agent-Run-Id')).toBe(RUN_ID);
    expect(response.headers.get('X-AGI-Workflow-Run-Id')).toBe('wrun_resume_1');
    expect(checkpointMocks.complete).not.toHaveBeenCalled();
  });

  it('forwards steering guidance to the durable continuation without leaking it into request validation', async () => {
    const response = await POST(
      makeRequest({ ...resumeBody(), guidance: '  Only touch the docs repo.  ' }),
    );
    await response.text();

    const syntheticBody = (await (
      mockProcessRequest.mock.calls[0]![0] as NextRequest
    ).json()) as Record<string, unknown>;
    expect(syntheticBody).not.toHaveProperty('guidance');

    expect(workflowMocks.start).toHaveBeenCalledWith(
      expect.objectContaining({
        continuation: expect.objectContaining({
          resume: {
            approvals: [{ toolCallId: 'call_1', decision: 'approved' }],
            guidance: 'Only touch the docs repo.',
          },
        }),
      }),
    );
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

  it('releases the checkpoint lease when tool discovery fails before execution', async () => {
    const managedUsage = {
      db,
      userId: 'user-1',
      idempotencyKey: 'agi.chat.web.tool-resume.resume-1',
      requestHash: 'request-hash',
      leaseToken: LEASE_TOKEN,
      estimatedCostCents: 4,
    };
    mockProcessRequest.mockResolvedValue({ ...processedRequest(), managedUsage });
    toolMocks.loadOperatorTools.mockRejectedValueOnce(new Error('tool registry unavailable'));

    const response = await POST(makeRequest(resumeBody()));

    expect(response.status).toBe(500);
    expect(checkpointMocks.release).toHaveBeenCalledWith(db, {
      userId: 'user-1',
      runId: RUN_ID,
      checkpointId: CHECKPOINT_ID,
      leaseToken: LEASE_TOKEN,
    });
    expect(managedUsageMocks.finalizeRequest).toHaveBeenCalledWith({
      ...managedUsage,
      outcome: 'failed',
      actualCostCents: 0,
      usage: { reason: 'tool_discovery_failed' },
    });
    expect(workflowMocks.start).not.toHaveBeenCalled();
  });

  it('releases billing and the checkpoint lease when the durable workflow cannot start', async () => {
    const managedUsage = processedRequest().managedUsage;
    workflowMocks.start.mockRejectedValueOnce(new Error('workflow service unavailable'));

    const response = await POST(makeRequest(resumeBody()));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'agent_workflow_unavailable' },
    });
    expect(managedUsageMocks.finalizeRequest).toHaveBeenCalledWith({
      ...managedUsage,
      outcome: 'failed',
      actualCostCents: 0,
      usage: { reason: 'workflow_start_failed' },
    });
    expect(checkpointMocks.release).toHaveBeenCalledWith(db, {
      userId: 'user-1',
      runId: RUN_ID,
      checkpointId: CHECKPOINT_ID,
      leaseToken: LEASE_TOKEN,
    });
  });

  it('retains extended thinking and its signed checkpoint continuity internally', async () => {
    const response = await POST(makeRequest(resumeBody()));
    await response.text();

    const passedProcessed = workflowMocks.start.mock.calls[0]![0].processed as ReturnType<
      typeof processedRequest
    >;
    expect(passedProcessed.llmRequest.thinking_mode).toBe(true);
    expect(passedProcessed.llmRequest.thinking).toEqual({
      type: 'enabled',
      budget_tokens: 1024,
    });
    expect(passedProcessed.llmRequest.effort).toBe('high');
    expect(passedProcessed.llmRequest.messages).toEqual(suspendedMessages);
  });

  /**
   * AGI-39. Every one of these used to be a 503: the route started the durable
   * workflow with no fallback, so a Workflow outage or an engaged kill-switch
   * failed an already-authorized approval permanently, with the checkpoint lease
   * consumed and the run parked.
   */
  describe('degraded transport still serves an authorized approval', () => {
    beforeEach(() => {
      workflowMocks.start.mockResolvedValue({
        transport: 'inline',
        workflowRunId: null,
        degradedReason: 'workflow_start_failed',
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
      expect(response.headers.get('X-AGI-Tool-Loop')).toBe('resume');
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
      expect(managedUsageMocks.finalizeRequest).not.toHaveBeenCalled();
    });
  });

  /**
   * Degrading the TRANSPORT must never degrade AUTHORIZATION. Each gate below
   * runs before a transport is chosen, and its refusal must still stand.
   */
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

    it('still refuses a forged approval when the transport would have degraded', async () => {
      checkpointMocks.claim.mockRejectedValue(new CloudAgentApprovalDecisionError());

      const response = await POST(makeRequest(resumeBody('call_forged')));

      expect(response.status).toBe(400);
      expect(workflowMocks.start).not.toHaveBeenCalled();
    });
  });

  it('overrides approval when the persisted connector permission blocks the tool', async () => {
    // Keyed on the SQL rather than call order: resolving permissions also reads
    // user_settings for lockdown, so a positional mock feeds the wrong query.
    db.query.mockImplementation(async (sql: string) =>
      sql.includes('connector_tool_permissions')
        ? [{ connector_id: 'github', tool_name: 'get_pull_request_diff', level: 'blocked' }]
        : [],
    );

    const response = await POST(makeRequest(resumeBody()));
    await response.text();

    expect(workflowMocks.start).toHaveBeenCalledWith(
      expect.objectContaining({
        continuation: expect.objectContaining({
          resume: {
            approvals: [{ toolCallId: 'call_1', decision: 'rejected' }],
          },
        }),
      }),
    );
  });
});
