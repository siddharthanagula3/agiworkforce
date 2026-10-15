import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
vi.mock('@agiworkforce/types', async (importOriginal) => ({
  ...(await importOriginal<TypesModule>()),
  connectorsReleased: () => true,
}));

type ScanModule0 = typeof import('@/lib/services/cloud-agent-run-service');
type ScanModule1 = typeof import('@/lib/services/managed-usage-request-service');
type ScanModule2 = typeof import('@/lib/services/managed-usage-accounting-service');
type RequestProcessorModule = typeof import('../lib/request-processor');

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
  resolveWorkspaceControlsForRequest: async () => ({ ok: true, controls: null }),
  buildWorkspaceFeatureGateResponse: vi.fn(async () => null),
  buildManagedComputeGateResponse: gateMocks.managedCompute,
  buildOrganizationPolicyGateResponse: gateMocks.orgPolicy,
  buildModelPolicyGateResponse: async () => null,
  buildSpendLimitGateResponse: gateMocks.spendLimit,
}));

const mockProcessRequest = vi.fn();
vi.mock('../lib/request-processor', async (importOriginal) => ({
  ...(await importOriginal<RequestProcessorModule>()),
  processRequest: (...args: unknown[]) => mockProcessRequest(...args),
  toManagedSkillFromUserSkill: vi.fn(),
  resolveNativeSearchMaxUses: () => 3,
  extractTextContent: (content: unknown) => (typeof content === 'string' ? content : ''),
}));

const mockRunToolLoop = vi.fn();
const toolMocks = vi.hoisted(() => ({
  loadOperatorTools: vi.fn(async (): Promise<unknown[]> => []),
  loadConnectorTools: vi.fn(async (): Promise<unknown[]> => []),
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
  ...(await importOriginal<ScanModule0>()),
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
  ...(await importOriginal<ScanModule1>()),
  markManagedUsageProviderStarted: managedUsageMocks.providerStarted,
  markManagedUsageClientDelivered: managedUsageMocks.delivered,
  finalizeManagedUsageRequest: managedUsageMocks.finalizeRequest,
}));

vi.mock('@/lib/services/managed-usage-accounting-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  finalizeObservedManagedUsage: managedUsageMocks.finalizeObserved,
}));

import {
  CloudAgentApprovalDecisionError,
  CloudAgentApprovalCheckpointNotFoundError,
} from '@/lib/services/cloud-agent-run-service';
import { buildApprovalCheckpointRequest } from '../lib/approval-checkpoint-request';
import type { ChatCompletionRequest } from '../lib/request-processor';
import { POST } from './route';

type TypesModule = typeof import('@agiworkforce/types');

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

  it('releases the checkpoint when the current processor refuses a resumed Google-data model route', async () => {
    const refusal = NextResponse.json(
      { error: { code: 'no_training_model_unavailable' } },
      { status: 503 },
    );
    mockProcessRequest.mockResolvedValue({ ok: false, response: refusal });
    const response = await POST(makeRequest(resumeBody()));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { code: 'no_training_model_unavailable' },
    });
    expect(checkpointMocks.release).toHaveBeenCalledOnce();
    expect(managedUsageMocks.providerStarted).not.toHaveBeenCalled();
    expect(workflowMocks.start).not.toHaveBeenCalled();
  });

  it('passes the checkpoint Google tool transcript through current request processing', async () => {
    const messages = [
      { role: 'user', content: 'Summarize my messages.' },
      {
        role: 'assistant',
        tool_calls: [
          {
            id: 'google-call',
            type: 'function',
            function: {
              name: 'mcp__gmail__search_threads',
              arguments: '{}',
            },
          },
        ],
      },
      { role: 'tool', tool_call_id: 'google-call', content: 'Google-source fixture' },
    ];
    checkpointMocks.claim.mockResolvedValue({
      ...claimedCheckpoint,
      checkpoint: {
        ...claimedCheckpoint.checkpoint,
        messages,
      },
    });
    const response = await POST(makeRequest(resumeBody()));
    expect(response.status).toBe(200);
    await response.text();
    const synthetic = mockProcessRequest.mock.calls[0]![0] as NextRequest;
    expect((await synthetic.json()).messages).toEqual(messages);
  });

  it('resumes under the refusal the turn began with, outside the replayed request (PC-F04)', async () => {
    const refusedCode = { allTools: false, codeExecution: true, webSearch: false };
    checkpointMocks.claim.mockResolvedValue({
      ...claimedCheckpoint,
      checkpoint: {
        ...claimedCheckpoint.checkpoint,
        request: buildApprovalCheckpointRequest(
          claimedCheckpoint.checkpoint.request as unknown as ChatCompletionRequest,
          {},
          [],
          undefined,
          refusedCode,
        ),
      },
    });

    const response = await POST(makeRequest(resumeBody()));
    await response.text();

    const [synthetic, , options] = mockProcessRequest.mock.calls[0]!;
    expect(options).toMatchObject({ turnToolProhibition: refusedCode });
    expect(await (synthetic as NextRequest).json()).not.toHaveProperty('x_turn_tool_prohibition');
  });

  it('preserves ordinary no-conversation approval continuity', async () => {
    checkpointMocks.claim.mockResolvedValue({
      ...claimedCheckpoint,
      checkpoint: {
        ...claimedCheckpoint.checkpoint,
        request: { ...claimedCheckpoint.checkpoint.request, conversation_id: undefined },
      },
    });
    mockProcessRequest.mockResolvedValue({ ...processedRequest(), conversationId: undefined });
    const response = await POST(makeRequest(resumeBody()));
    expect(response.status).toBe(200);
    await response.text();
    expect(checkpointMocks.claim).toHaveBeenCalledOnce();
    expect(mockProcessRequest).toHaveBeenCalledOnce();
    expect(workflowMocks.start).toHaveBeenCalledOnce();
    const synthetic = mockProcessRequest.mock.calls[0]![0] as NextRequest;
    expect((await synthetic.json()).conversation_id).toBeUndefined();
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
      isConnectorDenied: expect.any(Function),
      googleUserDataRouted: false,
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

  it('revalidates a legacy Free approval without treating injected tools as paid API add-ons', async () => {
    mockRunAuthGate.mockResolvedValue({
      ok: true,
      userId: 'user-1',
      token: 'tok',
      subscription: { plan_tier: 'free' },
    });
    checkpointMocks.claim.mockResolvedValue({
      ...claimedCheckpoint,
      checkpoint: {
        ...claimedCheckpoint.checkpoint,
        request: {
          conversation_id: CONVERSATION_ID,
          model: 'claude-test',
          stream: true,
          web_search: true,
          tools: [{ type: 'function', function: { name: 'skill', parameters: {} } }],
          tool_choice: 'auto',
        },
      },
    });

    const response = await POST(makeRequest(resumeBody()));
    await response.text();

    const syntheticBody = (await (
      mockProcessRequest.mock.calls[0]![0] as NextRequest
    ).json()) as Record<string, unknown>;
    expect(response.status).toBe(200);
    expect(syntheticBody).toMatchObject({ web_search: true, stream: true });
    expect(syntheticBody).not.toHaveProperty('tools');
    expect(syntheticBody).not.toHaveProperty('tool_choice');
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

describe('POST /api/llm/v1/chat/completions/approve, approval scopes', () => {
  const COMMENT_TOOL = 'mcp__github__post_issue_comment';
  const READ_TOOL = 'mcp__github__get_pull_request_diff';
  let sessionGrants: Array<unknown[]>;
  let standingWrites: Array<unknown[]>;

  function claimFor(qualifiedName: string) {
    return {
      ...claimedCheckpoint,
      checkpoint: {
        ...claimedCheckpoint.checkpoint,
        pendingToolCalls: [
          { id: 'call_1', qualifiedName, args: {}, approvalScopes: ['once', 'session', 'always'] },
        ],
      },
    };
  }

  function scopedBody(decision: string) {
    return { run_id: RUN_ID, tool_approvals: [{ tool_call_id: 'call_1', decision }] };
  }

  function turnPermissions() {
    const turn = workflowMocks.start.mock.calls[0]?.[0] as {
      connectorPermissions: {
        levelFor(name: string): string | undefined;
        isSessionGranted?(name: string): boolean;
      };
    };
    return turn.connectorPermissions;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    sessionGrants = [];
    standingWrites = [];
    toolMocks.loadOperatorTools.mockResolvedValue([]);
    gateMocks.managedCompute.mockReturnValue(null);
    gateMocks.orgPolicy.mockResolvedValue(null);
    gateMocks.spendLimit.mockResolvedValue(null);
    db.transaction.mockImplementation(async (operation: (tx: typeof db) => Promise<unknown>) =>
      operation(db),
    );
    toolMocks.loadConnectorTools.mockResolvedValue(
      [COMMENT_TOOL, READ_TOOL, 'mcp__custom-abc__do_thing'].map((qualifiedName) => {
        const [, serverId, toolName] = qualifiedName.split('__');
        return {
          qualifiedName,
          serverId,
          toolName,
          description: toolName,
          origin: 'connector' as const,
          inputSchema: { type: 'object', properties: {} },
        };
      }),
    );
    db.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('delete from public.connector_tool_session_grants')) {
        const existing = sessionGrants;
        sessionGrants = existing.filter((row) =>
          sql.includes('grant_row.conversation_id = $2')
            ? !(
                row[0] === params[0] &&
                row[1] === params[1] &&
                row[2] === params[2] &&
                row[3] === params[3] &&
                row[4] === params[4] &&
                row[7] === params[5]
              )
            : !(
                row[0] === params[0] &&
                row[2] === params[1] &&
                row[7] === params[2] &&
                (params[3] === null || row[3] === params[3])
              ),
        );
        return existing
          .filter((row) => !sessionGrants.includes(row))
          .map((_, index) => ({ id: `removed-${index}` }));
      }
      if (sql.includes('insert into public.connector_tool_session_grants')) {
        sessionGrants.push(params);
        return [{ id: 'grant-1' }];
      }
      if (sql.includes('from public.connector_tool_session_grants')) {
        return sessionGrants
          .filter(
            (row) =>
              row[0] === params[0] &&
              row[1] === params[1] &&
              row[4] === params[2] &&
              row[7] === params[3],
          )
          .map((row) => ({ connector_id: row[2], tool_name: row[3], risk_tier: row[6] }));
      }
      if (sql.includes('insert into public.connector_tool_permissions')) {
        standingWrites.push(params);
        return (params[2] as string[]).map((tool_name) => ({ tool_name }));
      }
      if (sql.includes('from public.connector_tool_permissions'))
        return standingWrites.flatMap((row) =>
          (row[2] as string[]).map((tool_name) => ({
            connector_id: row[1],
            tool_name,
            level: row[3],
          })),
        );
      return [];
    });
    mockRunAuthGate.mockResolvedValue({
      ok: true,
      userId: 'user-1',
      token: 'tok',
      subscription: { plan_tier: 'pro' },
    });
    mockProcessRequest.mockResolvedValue(processedRequest());
    workflowMocks.start.mockResolvedValue({
      transport: 'durable',
      workflowRunId: 'wrun_scope_1',
      readable: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          controller.close();
        },
      }),
    });
  });

  it('approves the call once and remembers nothing for a plain approval', async () => {
    checkpointMocks.claim.mockResolvedValue(claimFor(COMMENT_TOOL));
    const response = await POST(makeRequest(scopedBody('approved')));
    expect(response.status).toBe(200);
    await response.text();
    expect(sessionGrants).toEqual([]);
    expect(standingWrites).toEqual([]);
    expect(turnPermissions().levelFor(COMMENT_TOOL)).toBeUndefined();
  });

  it('records a conversation grant under Managed Cloud and allows the tool for the rest of the run', async () => {
    checkpointMocks.claim.mockResolvedValue(claimFor(COMMENT_TOOL));
    const response = await POST(makeRequest(scopedBody('approved-for-session')));
    expect(response.status).toBe(200);
    await response.text();

    const claimArgs = checkpointMocks.claim.mock.calls[0]![1] as {
      approvals: Array<{ decision: string }>;
    };
    expect(claimArgs.approvals).toEqual([{ toolCallId: 'call_1', decision: 'approved' }]);
    expect(sessionGrants).toEqual([
      [
        'user-1',
        CONVERSATION_ID,
        'github',
        'post_issue_comment',
        'managed',
        true,
        'critical',
        null,
      ],
    ]);
    expect(standingWrites).toEqual([]);
    expect(turnPermissions().levelFor(COMMENT_TOOL)).toBe('allow');
  });

  it('saves a standing allow for a declared non-destructive tool, never overwriting a block', async () => {
    checkpointMocks.claim.mockResolvedValue(claimFor(READ_TOOL));
    const response = await POST(makeRequest(scopedBody('approved-always')));
    expect(response.status).toBe(200);
    await response.text();
    expect(standingWrites).toHaveLength(1);
    expect(standingWrites[0]!.slice(0, 6)).toEqual([
      'user-1',
      'github',
      ['get_pull_request_diff'],
      'always-allow',
      [false],
      true,
    ]);
    expect(sessionGrants).toEqual([]);
  });

  it('refuses to save a standing allow for a critical tool and releases the claim', async () => {
    checkpointMocks.claim.mockResolvedValue(claimFor(COMMENT_TOOL));
    const response = await POST(makeRequest(scopedBody('approved-always')));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'tool_approval_scope_refused' },
    });
    expect(checkpointMocks.release).toHaveBeenCalledOnce();
    expect(standingWrites).toEqual([]);
    expect(sessionGrants).toEqual([]);
    expect(mockProcessRequest).not.toHaveBeenCalled();
    expect(workflowMocks.start).not.toHaveBeenCalled();
  });

  it('saves a standing allow for an undeclared remote tool, which is high rather than critical', async () => {
    checkpointMocks.claim.mockResolvedValue(claimFor('mcp__custom-abc__do_thing'));
    const response = await POST(makeRequest(scopedBody('approved-always')));
    expect(response.status).toBe(200);
    await response.text();
    expect(standingWrites).toHaveLength(1);
    expect(standingWrites[0]!.slice(1, 5)).toEqual([
      'custom-abc',
      ['do_thing'],
      'always-allow',
      [true],
    ]);
  });

  it('refuses a stale always selection when current annotations make the tool critical', async () => {
    toolMocks.loadConnectorTools.mockResolvedValueOnce([
      {
        qualifiedName: 'mcp__custom-abc__do_thing',
        serverId: 'custom-abc',
        toolName: 'do_thing',
        description: 'Deletes things',
        origin: 'connector',
        inputSchema: { type: 'object', properties: {} },
        annotations: { destructiveHint: true },
      },
    ] as never);
    checkpointMocks.claim.mockResolvedValue(claimFor('mcp__custom-abc__do_thing'));
    const response = await POST(makeRequest(scopedBody('approved-always')));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'tool_approval_scope_refused' } });
    expect(workflowMocks.start).not.toHaveBeenCalled();
    expect(standingWrites).toEqual([]);
    const claimArgs = checkpointMocks.claim.mock.calls[0]![1] as {
      approvals: Array<{ decision: string }>;
    };
    expect(claimArgs.approvals).toEqual([{ toolCallId: 'call_1', decision: 'approved' }]);
  });

  it('allows a critical tool for the conversation after its confirmation', async () => {
    checkpointMocks.claim.mockResolvedValue(claimFor(COMMENT_TOOL));
    const response = await POST(makeRequest(scopedBody('approved-for-session')));
    expect(response.status).toBe(200);
    await response.text();
    expect(sessionGrants).toHaveLength(1);
    expect(turnPermissions().isSessionGranted?.(COMMENT_TOOL)).toBe(true);
  });

  it('rejects a remembered scope from a temporary chat instead of silently downgrading', async () => {
    checkpointMocks.claim.mockResolvedValue(claimFor(READ_TOOL));
    mockProcessRequest.mockResolvedValue({ ...processedRequest(), conversationIsTemporary: true });
    const response = await POST(makeRequest(scopedBody('approved-always')));
    expect(response.status).toBe(400);
    expect(workflowMocks.start).not.toHaveBeenCalled();
    expect(standingWrites).toEqual([]);
  });

  it('rejects conversation scope for a temporary chat', async () => {
    checkpointMocks.claim.mockResolvedValue(claimFor(COMMENT_TOOL));
    mockProcessRequest.mockResolvedValue({ ...processedRequest(), conversationIsTemporary: true });
    const response = await POST(makeRequest(scopedBody('approved-for-session')));
    expect(response.status).toBe(400);
    expect(workflowMocks.start).not.toHaveBeenCalled();
    expect(sessionGrants).toEqual([]);
  });

  it('does not carry a grant from another conversation into this run', async () => {
    sessionGrants.push([
      'user-1',
      'another-conversation',
      'github',
      'post_issue_comment',
      'managed',
      true,
      'critical',
      null,
    ]);
    checkpointMocks.claim.mockResolvedValue(claimFor(COMMENT_TOOL));
    const response = await POST(makeRequest(scopedBody('approved')));
    expect(response.status).toBe(200);
    await response.text();
    expect(turnPermissions().levelFor(COMMENT_TOOL)).toBeUndefined();
  });

  it('does not carry a grant made under another trust boundary into this run', async () => {
    sessionGrants.push([
      'user-1',
      CONVERSATION_ID,
      'github',
      'post_issue_comment',
      'byok',
      true,
      'critical',
      null,
    ]);
    checkpointMocks.claim.mockResolvedValue(claimFor(COMMENT_TOOL));
    const response = await POST(makeRequest(scopedBody('approved')));
    expect(response.status).toBe(200);
    await response.text();
    expect(turnPermissions().levelFor(COMMENT_TOOL)).toBeUndefined();
  });

  it.each([undefined, ['once']])(
    'refuses a scoped decision absent from the server checkpoint (%j)',
    async (approvalScopes) => {
      const claim = claimFor(READ_TOOL);
      checkpointMocks.claim.mockResolvedValue({
        ...claim,
        checkpoint: {
          ...claim.checkpoint,
          pendingToolCalls: [{ id: 'call_1', qualifiedName: READ_TOOL, args: {}, approvalScopes }],
        },
      });
      const response = await POST(makeRequest(scopedBody('approved-for-session')));
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: { code: 'tool_approval_scope_refused' },
      });
      expect(checkpointMocks.release).toHaveBeenCalledOnce();
      expect(workflowMocks.start).not.toHaveBeenCalled();
      expect(managedUsageMocks.providerStarted).not.toHaveBeenCalled();
      expect(sessionGrants).toEqual([]);
    },
  );

  it('rolls back a mixed scope batch when the later grant insert fails, before provider work', async () => {
    const claim = claimFor(COMMENT_TOOL);
    checkpointMocks.claim.mockResolvedValue({
      ...claim,
      checkpoint: {
        ...claim.checkpoint,
        pendingToolCalls: [
          ...claim.checkpoint.pendingToolCalls,
          {
            id: 'call_2',
            qualifiedName: READ_TOOL,
            args: {},
            approvalScopes: ['once', 'session', 'always'],
          },
        ],
      },
    });
    const query = db.query.getMockImplementation()!;
    db.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('insert into public.connector_tool_session_grants'))
        throw new Error('Grant insert failed');
      return query(sql, params);
    });
    const nested = vi.fn(async () => {
      throw new Error('Nested transaction');
    });
    db.transaction.mockImplementation(async (operation: (tx: unknown) => Promise<unknown>) => {
      const beforeSession = [...sessionGrants];
      const beforeStanding = [...standingWrites];
      try {
        return await operation({ query: db.query, transaction: nested });
      } catch (error) {
        sessionGrants = beforeSession;
        standingWrites = beforeStanding;
        throw error;
      }
    });
    const response = await POST(
      makeRequest({
        run_id: RUN_ID,
        tool_approvals: [
          { tool_call_id: 'call_1', decision: 'approved-for-session' },
          { tool_call_id: 'call_2', decision: 'approved-always' },
        ],
      }),
    );
    expect(response.status).toBe(503);
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(nested).not.toHaveBeenCalled();
    expect(
      db.query.mock.calls.some(([sql]) =>
        String(sql).includes('insert into public.connector_tool_permissions'),
      ),
    ).toBe(true);
    expect(sessionGrants).toEqual([]);
    expect(standingWrites).toEqual([]);
    expect(checkpointMocks.release).toHaveBeenCalledOnce();
    expect(workflowMocks.start).not.toHaveBeenCalled();
    expect(managedUsageMocks.providerStarted).not.toHaveBeenCalled();
  });

  it('states that permissions were saved if the post-commit confirmation becomes unavailable', async () => {
    checkpointMocks.claim.mockResolvedValue(claimFor(COMMENT_TOOL));
    const query = db.query.getMockImplementation()!;
    db.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (
        sessionGrants.length > 0 &&
        sql.includes('from public.connector_tool_session_grants') &&
        !sql.includes('delete from')
      )
        throw new Error('Grant read unavailable after commit');
      return query(sql, params);
    });
    const response = await POST(makeRequest(scopedBody('approved-for-session')));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { message: expect.stringContaining('permissions were saved') },
    });
    expect(sessionGrants).toHaveLength(1);
    expect(checkpointMocks.release).toHaveBeenCalledOnce();
    expect(workflowMocks.start).not.toHaveBeenCalled();
    expect(managedUsageMocks.providerStarted).not.toHaveBeenCalled();
  });

  it('rejects a stale conversation-scope selection when its table is unavailable', async () => {
    checkpointMocks.claim.mockResolvedValue(claimFor(READ_TOOL));
    const query = db.query.getMockImplementation()!;
    db.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('from public.connector_tool_session_grants'))
        throw Object.assign(new Error('grant table missing'), { code: '42P01' });
      return query(sql, params);
    });
    const response = await POST(makeRequest(scopedBody('approved-for-session')));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'tool_approval_scope_refused' } });
    expect(checkpointMocks.release).toHaveBeenCalledOnce();
    expect(workflowMocks.start).not.toHaveBeenCalled();
    expect(managedUsageMocks.providerStarted).not.toHaveBeenCalled();
    expect(sessionGrants).toEqual([]);
  });

  it('reports a failed scoped write instead of running as a silent once approval', async () => {
    checkpointMocks.claim.mockResolvedValue(claimFor(READ_TOOL));
    const query = db.query.getMockImplementation()!;
    db.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('insert into public.connector_tool_session_grants'))
        throw new Error('grant write unavailable');
      return query(sql, params);
    });
    const response = await POST(makeRequest(scopedBody('approved-for-session')));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { message: expect.stringContaining('Approve this call once instead') },
    });
    expect(checkpointMocks.release).toHaveBeenCalledOnce();
    expect(workflowMocks.start).not.toHaveBeenCalled();
    expect(managedUsageMocks.providerStarted).not.toHaveBeenCalled();
    expect(sessionGrants).toEqual([]);
  });

  it('cannot remember an operator tool as a user connector permission', async () => {
    checkpointMocks.claim.mockResolvedValue(claimFor(READ_TOOL));
    toolMocks.loadConnectorTools.mockResolvedValue([]);
    toolMocks.loadOperatorTools.mockResolvedValue([
      {
        qualifiedName: READ_TOOL,
        serverId: 'github',
        toolName: 'get_pull_request_diff',
        origin: 'operator',
        description: 'Operator fixture',
        inputSchema: { type: 'object', properties: {} },
      },
    ]);
    const response = await POST(makeRequest(scopedBody('approved-for-session')));
    expect(response.status).toBe(400);
    expect(workflowMocks.start).not.toHaveBeenCalled();
    expect(sessionGrants).toEqual([]);
  });

  it('refuses a scope outside the published decisions before claiming anything', async () => {
    const response = await POST(makeRequest(scopedBody('approved-forever')));
    expect(response.status).toBe(400);
    expect(checkpointMocks.claim).not.toHaveBeenCalled();
  });

  it('refuses an unauthenticated scoped approval before claiming anything', async () => {
    mockRunAuthGate.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }),
    });
    const response = await POST(makeRequest(scopedBody('approved-for-session')));
    expect(response.status).toBe(401);
    expect(checkpointMocks.claim).not.toHaveBeenCalled();
    expect(sessionGrants).toEqual([]);
  });
});
