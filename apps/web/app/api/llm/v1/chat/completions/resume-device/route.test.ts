import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const RUN_ID = '0190a000-0000-7000-8000-000000000001';
const CHECKPOINT_ID = '0190a000-0000-7000-8000-000000000002';
const LEASE_TOKEN = '0190a000-0000-7000-8000-000000000003';
const CONVERSATION_ID = '0190a000-0000-7000-8000-000000000004';
const DEVICE_ID = 'device-macbook-1';

const mocks = vi.hoisted(() => ({
  authGate: vi.fn(),
  turnSlot: vi.fn(),
  managedCompute: vi.fn(),
  orgPolicy: vi.fn(),
  spendLimit: vi.fn(),
  processRequest: vi.fn(),
  operatorTools: vi.fn(),
  connectorTools: vi.fn(),
  permissions: vi.fn(),
  approvalPolicy: vi.fn(),
  secretGate: vi.fn(),
  runTurn: vi.fn(),
  boundStream: vi.fn(),
  claim: vi.fn(),
  release: vi.fn(),
  providerStarted: vi.fn(),
  finalize: vi.fn(),
  workspaceControls: vi.fn(),
}));

const db = { query: vi.fn(), execute: vi.fn(), transaction: vi.fn() };

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/logger')>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('../lib/auth-gate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/auth-gate')>()),
  runAuthGate: mocks.authGate,
}));
vi.mock('../lib/turn-slot', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/turn-slot')>()),
  withManagedTurnSlot: mocks.turnSlot,
}));
vi.mock('@/lib/managed-compute-gate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/managed-compute-gate')>()),
  resolveWorkspaceControlsForRequest: mocks.workspaceControls,
  buildManagedComputeGateResponse: mocks.managedCompute,
  buildOrganizationPolicyGateResponse: mocks.orgPolicy,
  buildSpendLimitGateResponse: mocks.spendLimit,
}));
vi.mock('../lib/request-processor', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/request-processor')>()),
  processRequest: mocks.processRequest,
}));
vi.mock('../lib/tool-loop', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/tool-loop')>()),
  loadMcpToolDefs: mocks.operatorTools,
}));
vi.mock('@/lib/user-connector-tools', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/user-connector-tools')>()),
  loadUserConnectorToolDefs: mocks.connectorTools,
}));
vi.mock('../lib/connector-tool-permissions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/connector-tool-permissions')>()),
  loadConnectorToolPermissions: mocks.permissions,
}));
vi.mock('../lib/tool-approval-policy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/tool-approval-policy')>()),
  loadToolApprovalPolicy: mocks.approvalPolicy,
}));
vi.mock('../lib/secret-handling-gate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/secret-handling-gate')>()),
  applySecretHandlingToTexts: mocks.secretGate,
}));
vi.mock('@/lib/workflows/start-cloud-agent-workflow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/workflows/start-cloud-agent-workflow')>()),
  runCloudAgentTurn: mocks.runTurn,
}));
vi.mock('@/lib/workflows/durable-stream-bounds', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/workflows/durable-stream-bounds')>()),
  boundDurableTurnStream: mocks.boundStream,
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/rls-db')>()),
  getUserScopedDb: vi.fn(async () => ({ db, userId: 'user-1', organizationId: null })),
}));
vi.mock('@/lib/services/cloud-agent-run-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/cloud-agent-run-service')>()),
  claimCloudAgentDeviceCheckpoint: mocks.claim,
  releaseCloudAgentDeviceCheckpoint: mocks.release,
}));
vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/managed-usage-request-service')>()),
  markManagedUsageProviderStarted: mocks.providerStarted,
  finalizeManagedUsageRequest: mocks.finalize,
}));

import {
  CloudAgentApprovalCheckpointConflictError,
  CloudAgentApprovalCheckpointExpiredError,
  CloudAgentApprovalCheckpointNotFoundError,
  CloudAgentDeviceMismatchError,
  CloudAgentDeviceStepResultError,
} from '@/lib/services/cloud-agent-run-service';
import { ManagedUsageRequestError } from '@/lib/services/managed-usage-request-service';
import { POST } from './route';

const pausedMessages = [
  { role: 'user', content: 'Tidy my Downloads folder' },
  {
    role: 'assistant',
    content: '',
    tool_calls: [
      {
        id: 'call_1',
        type: 'function',
        function: { name: 'device__list_directory', arguments: '{"path":"~/Downloads"}' },
      },
    ],
    __canonicalThinking: [{ type: 'thinking', thinking: 'private', signature: 'signed' }],
  },
];

const deviceResults = [{ toolCallId: 'call_1', content: 'invoice.pdf\nphoto.jpg', isError: false }];

function claimed(request: Record<string, unknown> = {}) {
  return {
    checkpoint: {
      id: CHECKPOINT_ID,
      runId: RUN_ID,
      userId: 'user-1',
      version: 1,
      sessionId: CONVERSATION_ID,
      turnId: 'original-turn-1',
      nextEventSequence: 4,
      completedSteps: 2,
      request: {
        model: 'claude-test',
        stream: true,
        conversation_id: CONVERSATION_ID,
        work_mode: 'agiwork',
        ...request,
      },
      messages: pausedMessages,
      pendingToolCalls: [],
      state: 'resuming',
      leaseToken: LEASE_TOKEN,
      leaseExpiresAt: '2026-09-27T12:15:00.000Z',
      resolvedAt: null,
      createdAt: '2026-09-27T12:00:00.000Z',
      updatedAt: '2026-09-27T12:00:00.000Z',
      deviceStep: {
        deviceId: DEVICE_ID,
        deviceName: 'MacBook',
        steps: [{ toolCallId: 'call_1', summary: 'List Downloads' }],
      },
    },
    results: deviceResults,
    leaseToken: LEASE_TOKEN,
  };
}

const managedUsage = {
  db,
  userId: 'user-1',
  idempotencyKey: 'agi.chat.desktop.device-resume.resume-1',
  requestHash: 'request-hash',
  leaseToken: LEASE_TOKEN,
  estimatedCostMicrousd: 40_000,
  estimatedCostCents: 4,
};

function processed() {
  return {
    ok: true,
    requestId: 'agi.chat.desktop.device-resume.resume-1',
    conversationId: CONVERSATION_ID,
    provider: 'anthropic',
    requestedModel: 'claude-test',
    subscriptionTier: 'pro',
    chatRequest: { model: 'claude-test', messages: [], stream: true },
    llmRequest: { model: 'claude-test', messages: [], max_tokens: 4096, stream: true },
    quotaWarningHeader: null,
    managedUsage,
  };
}

function resumeBody(over: Record<string, unknown> = {}) {
  return {
    run_id: RUN_ID,
    device_id: DEVICE_ID,
    device_results: [
      { tool_call_id: 'call_1', content: 'invoice.pdf\nphoto.jpg', is_error: false },
    ],
    ...over,
  };
}

function resume(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/llm/v1/chat/completions/resume-device', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': 'agi.chat.desktop.device-resume.resume-1',
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function doneStream(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
}

async function syntheticBody(): Promise<Record<string, unknown>> {
  const request = mocks.processRequest.mock.calls[0]![0] as NextRequest;
  return (await request.json()) as Record<string, unknown>;
}

beforeEach(() => {
  mocks.authGate.mockResolvedValue({
    ok: true,
    userId: 'user-1',
    token: 'tok',
    subscription: { plan_tier: 'pro' },
  });
  mocks.turnSlot.mockImplementation(async (_caller: unknown, dispatch: () => Promise<Response>) =>
    dispatch(),
  );
  mocks.managedCompute.mockReturnValue(null);
  mocks.orgPolicy.mockResolvedValue(null);
  mocks.spendLimit.mockResolvedValue(null);
  mocks.secretGate.mockImplementation(async (_userId: string, texts: string[]) => ({
    action: 'clean',
    texts,
  }));
  mocks.claim.mockResolvedValue(claimed());
  mocks.release.mockResolvedValue(undefined);
  mocks.processRequest.mockResolvedValue(processed());
  mocks.workspaceControls.mockResolvedValue({ ok: true, controls: null });
  mocks.permissions.mockResolvedValue({ isConnectorToolDenied: () => false });
  mocks.operatorTools.mockResolvedValue([]);
  mocks.connectorTools.mockResolvedValue([]);
  mocks.approvalPolicy.mockResolvedValue({});
  mocks.providerStarted.mockResolvedValue(undefined);
  mocks.finalize.mockResolvedValue({
    requestStatus: 'released',
    operationResult: 'finalized',
    settlementStatus: 'succeeded',
    actualCostCents: 0,
  });
  mocks.runTurn.mockResolvedValue({
    transport: 'durable',
    workflowRunId: 'wrun_device_1',
    readable: doneStream(),
  });
  mocks.boundStream.mockImplementation((input: { readable: ReadableStream }) => input.readable);
});

describe('POST /api/llm/v1/chat/completions/resume-device', () => {
  it('continues the paused run from trusted state with what the device returned', async () => {
    const response = await POST(resume(resumeBody()));
    await response.text();

    expect(response.status).toBe(200);
    expect(mocks.turnSlot).toHaveBeenCalledWith(
      { userId: 'user-1', planTier: 'pro' },
      expect.any(Function),
    );
    expect(mocks.claim).toHaveBeenCalledWith(db, {
      userId: 'user-1',
      runId: RUN_ID,
      deviceId: DEVICE_ID,
      results: deviceResults,
    });
    const body = await syntheticBody();
    expect(body).toMatchObject({
      model: 'claude-test',
      stream: true,
      conversation_id: CONVERSATION_ID,
      work_mode: 'agiwork',
    });
    expect(body).not.toHaveProperty('run_id');
    expect(body).not.toHaveProperty('device_results');
    expect(JSON.stringify(body)).not.toContain('__canonicalThinking');

    expect(mocks.providerStarted).toHaveBeenCalledWith(managedUsage);
    expect(mocks.runTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        db,
        runId: RUN_ID,
        userId: 'user-1',
        approvalMode: 'manual',
        onDurableUnavailable: 'inline',
        completionReason: 'tool_loop_device_resume_completed',
        cancellationReason: 'client_cancelled_tool_loop_device_resume',
        processed: expect.objectContaining({
          llmRequest: expect.objectContaining({ messages: pausedMessages }),
        }),
        continuation: {
          eventSessionId: CONVERSATION_ID,
          eventTurnId: 'original-turn-1',
          initialEventSequence: 4,
          initialCompletedSteps: 2,
          invocationContinuation: false,
          resume: { deviceResults },
        },
        predecessorApproval: { checkpointId: CHECKPOINT_ID, leaseToken: LEASE_TOKEN },
      }),
    );
    expect(response.headers.get('X-AGI-Tool-Loop')).toBe('resume-device');
    expect(response.headers.get('X-AGI-Agent-Run-Id')).toBe(RUN_ID);
    expect(response.headers.get('X-AGI-Workflow-Run-Id')).toBe('wrun_device_1');
    expect(response.headers.get('X-AGI-Agent-Transport')).toBe('durable');
    expect(mocks.finalize).not.toHaveBeenCalled();
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it('advertises no workflow run for a turn that fell back to the request', async () => {
    mocks.runTurn.mockResolvedValue({ transport: 'inline', readable: doneStream() });

    const response = await POST(resume(resumeBody()));
    await response.text();

    expect(response.headers.get('X-AGI-Agent-Transport')).toBe('inline');
    expect(response.headers.get('X-AGI-Workflow-Run-Id')).toBeNull();
    expect(mocks.boundStream).not.toHaveBeenCalled();
  });

  it('drops tools a Free request never paid for when it revalidates the paused request', async () => {
    mocks.authGate.mockResolvedValue({
      ok: true,
      userId: 'user-1',
      token: 'tok',
      subscription: { plan_tier: 'free' },
    });
    mocks.claim.mockResolvedValue(
      claimed({
        tools: [{ type: 'function', function: { name: 'skill', parameters: {} } }],
        tool_choice: 'auto',
      }),
    );

    const response = await POST(resume(resumeBody()));
    await response.text();

    const body = await syntheticBody();
    expect(body).not.toHaveProperty('tools');
    expect(body).not.toHaveProperty('tool_choice');
  });

  it.each([
    ['a malformed body', resumeBody({ device_results: [] })],
    ['a body that is not JSON', '{"run_id":'],
  ])('refuses %s before claiming the step or reserving credits', async (_case, body) => {
    const response = await POST(resume(body));

    expect(response.status).toBe(400);
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.processRequest).not.toHaveBeenCalled();
  });

  it('blocks a device result that carries a secret before the model can read it', async () => {
    mocks.secretGate.mockResolvedValue({ action: 'blocked', texts: [] });

    const response = await POST(resume(resumeBody()));

    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain(
      'appears to contain a secret, such as an API key or access token',
    );
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.processRequest).not.toHaveBeenCalled();
  });

  it('passes on a redacted result rather than the original', async () => {
    mocks.secretGate.mockResolvedValue({ action: 'redacted', texts: ['invoice.pdf\n[REDACTED]'] });

    await (await POST(resume(resumeBody()))).text();

    expect(mocks.claim).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        results: [{ toolCallId: 'call_1', content: 'invoice.pdf\n[REDACTED]', isError: false }],
      }),
    );
  });

  it.each([
    ['results that do not match the paused step', new CloudAgentDeviceStepResultError(), 400],
    ['a different device', new CloudAgentDeviceMismatchError(), 409],
    ['an expired step', new CloudAgentApprovalCheckpointExpiredError(), 410],
    [
      'a run with no pending step on this account',
      new CloudAgentApprovalCheckpointNotFoundError(),
      404,
    ],
    ['a step already being resumed', new CloudAgentApprovalCheckpointConflictError(), 409],
  ])('answers %s without reserving credits', async (_case, error, status) => {
    mocks.claim.mockRejectedValue(error);

    const response = await POST(resume(resumeBody()));

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'device_step_invalid' },
    });
    expect(mocks.processRequest).not.toHaveBeenCalled();
  });

  it('stops at the workspace spend limit before claiming the step', async () => {
    mocks.spendLimit.mockResolvedValue(
      NextResponse.json({ error: { code: 'spend_limit_reached' } }, { status: 402 }),
    );

    const response = await POST(resume(resumeBody()));

    expect(response.status).toBe(402);
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.processRequest).not.toHaveBeenCalled();
  });

  it('releases the device step when the request is refused on revalidation', async () => {
    mocks.processRequest.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: { code: 'usage_limit_reached' } }, { status: 429 }),
    });

    const response = await POST(resume(resumeBody()));

    expect(response.status).toBe(429);
    expect(mocks.release).toHaveBeenCalledWith(db, {
      userId: 'user-1',
      runId: RUN_ID,
      checkpointId: CHECKPOINT_ID,
      leaseToken: LEASE_TOKEN,
    });
    expect(mocks.runTurn).not.toHaveBeenCalled();
  });

  it('releases the reservation at no charge and the step when tool discovery fails', async () => {
    mocks.operatorTools.mockRejectedValue(new Error('tool registry unavailable'));

    const response = await POST(resume(resumeBody()));

    expect(response.status).toBe(500);
    expect(mocks.finalize).toHaveBeenCalledWith({
      ...managedUsage,
      outcome: 'failed',
      actualCostCents: 0,
      usage: { reason: 'tool_discovery_failed' },
    });
    expect(mocks.release).toHaveBeenCalledOnce();
    expect(mocks.providerStarted).not.toHaveBeenCalled();
  });

  it('releases the reservation at no charge when the provider start cannot be recorded', async () => {
    mocks.providerStarted.mockRejectedValue(new Error('ledger unavailable'));

    const response = await POST(resume(resumeBody()));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'billing_unavailable' },
    });
    expect(mocks.finalize).toHaveBeenCalledWith({
      ...managedUsage,
      outcome: 'failed',
      actualCostCents: 0,
      usage: { reason: 'provider_start_failed' },
    });
    expect(mocks.release).toHaveBeenCalledOnce();
    expect(mocks.runTurn).not.toHaveBeenCalled();
  });

  it('keeps the billing refusal the ledger gave when the provider start is refused', async () => {
    mocks.providerStarted.mockRejectedValue(
      new ManagedUsageRequestError('Usage limit reached.', 429, 'usage_limit_reached'),
    );

    const response = await POST(resume(resumeBody()));

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'usage_limit_reached', message: 'Usage limit reached.' },
    });
  });

  it('releases the reservation at no charge when neither transport can start the turn', async () => {
    mocks.runTurn.mockRejectedValue(new Error('workflow platform down'));

    const response = await POST(resume(resumeBody()));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'agent_workflow_unavailable' },
    });
    expect(mocks.finalize).toHaveBeenCalledWith({
      ...managedUsage,
      outcome: 'failed',
      actualCostCents: 0,
      usage: { reason: 'workflow_start_failed' },
    });
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it('returns the auth refusal without admitting a turn', async () => {
    mocks.authGate.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }),
    });

    const response = await POST(resume(resumeBody()));

    expect(response.status).toBe(401);
    expect(mocks.turnSlot).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  describe('keeps the turn under the rules it started with', () => {
    it('revalidates the resumed request under the workspace controls', async () => {
      const controls = { featureAccess: { 'computer.use': false } };
      mocks.workspaceControls.mockResolvedValue({ ok: true, controls });

      const response = await POST(resume(resumeBody()));
      await response.text();

      expect(mocks.processRequest.mock.calls[0]![2]).toEqual({ workspaceControls: controls });
    });

    it('releases the device step when the workspace controls refuse the resume', async () => {
      mocks.workspaceControls.mockResolvedValue({
        ok: false,
        response: new Response(null, { status: 403 }),
      });

      const response = await POST(resume(resumeBody()));

      expect(response.status).toBe(403);
      expect(mocks.processRequest).not.toHaveBeenCalled();
      expect(mocks.release).toHaveBeenCalled();
    });

    it('offers no connector tools when the chat switched connectors off', async () => {
      mocks.processRequest.mockResolvedValue({
        ...processed(),
        chatRequest: { ...processed().chatRequest, connector_tools_enabled: false },
      });

      const response = await POST(resume(resumeBody()));
      await response.text();

      expect(mocks.connectorTools).not.toHaveBeenCalled();
    });

    it('denies a connector this chat turned off and asks for a saved allow in a temporary chat', async () => {
      mocks.permissions.mockResolvedValue({
        entries: [],
        isConnectorToolDenied: () => false,
        isDenied: () => false,
        levelFor: () => 'allow',
        levelForConnectorTool: () => 'allow',
      });
      mocks.processRequest.mockResolvedValue({
        ...processed(),
        conversationIsTemporary: true,
        chatRequest: { ...processed().chatRequest, disabled_connector_ids: ['slack'] },
      });

      const response = await POST(resume(resumeBody()));
      await response.text();

      const permissions = (
        mocks.runTurn.mock.calls[0]![0] as {
          connectorPermissions: {
            isConnectorToolDenied: (connector: string, tool: string) => boolean;
            levelFor: (name: string) => string | undefined;
          };
        }
      ).connectorPermissions;
      expect(permissions.isConnectorToolDenied('slack', 'post_message')).toBe(true);
      expect(permissions.isConnectorToolDenied('github', 'list_issues')).toBe(false);
      expect(permissions.levelFor('mcp__github__list_issues')).toBe('ask');
    });
  });
});
