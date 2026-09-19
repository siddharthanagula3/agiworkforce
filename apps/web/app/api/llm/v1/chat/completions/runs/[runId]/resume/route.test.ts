import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

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

vi.mock('../../../lib/tool-approval-policy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/tool-approval-policy')>()),
  loadToolApprovalPolicy: vi.fn(async () => 'ask'),
}));

const secretGate = vi.hoisted(() => ({
  apply: vi.fn(async (_userId: string, texts: string[]) => ({ action: 'allowed', texts })),
}));
vi.mock('../../../lib/secret-handling-gate', () => ({
  applySecretHandlingToTexts: secretGate.apply,
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

import {
  CloudAgentApprovalCheckpointConflictError,
  CloudAgentApprovalCheckpointNotFoundError,
} from '@/lib/services/cloud-agent-run-service';
import { POST } from './route';

const pausedMessages = [
  { role: 'user', content: 'research the market' },
  {
    role: 'assistant',
    content: 'Found three competitors.',
    __canonicalThinking: [{ type: 'thinking', thinking: 'private', signature: 'signed' }],
  },
];

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
    request: { model: 'claude-test', stream: true, work_mode: 'agiwork' },
    messages: pausedMessages,
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

function makeRequest(body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/llm/v1/chat/completions/runs/${RUN_ID}/resume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-AGI-Origin-Surface': 'web' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/llm/v1/chat/completions/runs/[runId]/resume', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunAuthGate.mockResolvedValue({
      ok: true,
      userId: 'user-1',
      token: 'tok',
      subscription: { plan_tier: 'pro' },
    });
    runMocks.withdraw.mockResolvedValue(null);
    runMocks.claim.mockResolvedValue(claim);
    mockProcessRequest.mockResolvedValue({
      ok: true,
      requestId: 'resume-request-1',
      provider: 'anthropic',
      subscriptionTier: 'pro',
      chatRequest: { model: 'claude-test', messages: [], stream: true },
      llmRequest: { model: 'claude-test', messages: [], max_tokens: 4096, stream: true },
      quotaWarningHeader: null,
    });
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

  it('withdraws a pause the run has not reached instead of starting it again', async () => {
    runMocks.withdraw.mockResolvedValue({ id: RUN_ID, state: 'running', pauseRequestedAt: null });

    const response = await POST(makeRequest({}), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ run: { state: 'running' } });
    expect(runMocks.claim).not.toHaveBeenCalled();
    expect(workflowMocks.start).not.toHaveBeenCalled();
  });

  it('refuses a run that is not paused', async () => {
    runMocks.claim.mockRejectedValue(new CloudAgentApprovalCheckpointNotFoundError());

    const response = await POST(makeRequest({}), context);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'run_not_paused' } });
    expect(workflowMocks.start).not.toHaveBeenCalled();
  });

  it('refuses a second resume of the same pause', async () => {
    runMocks.claim.mockRejectedValue(new CloudAgentApprovalCheckpointConflictError());

    const response = await POST(makeRequest({}), context);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'run_already_resuming' },
    });
  });

  it('rejects guidance that would carry an unknown field', async () => {
    const response = await POST(makeRequest({ guidance: 'go', run_id: RUN_ID }), context);

    expect(response.status).toBe(400);
    expect(runMocks.claim).not.toHaveBeenCalled();
  });

  it('continues from the paused transcript and cursor with the user guidance', async () => {
    const response = await POST(makeRequest({ guidance: 'Focus on pricing.' }), context);
    await response.text();

    const synthetic = mockProcessRequest.mock.calls[0]![0] as NextRequest;
    expect(synthetic.headers.get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/);
    const syntheticBody = (await synthetic.json()) as Record<string, unknown>;
    expect(JSON.stringify(syntheticBody)).not.toContain('__canonicalThinking');
    expect(workflowMocks.start).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: RUN_ID,
        userId: 'user-1',
        approvalMode: 'manual',
        onDurableUnavailable: 'inline',
        continuation: {
          eventSessionId: CONVERSATION_ID,
          eventTurnId: 'original-turn-1',
          initialEventSequence: 9,
          initialCompletedSteps: 3,
          invocationContinuation: true,
          resumedFromPause: { guidance: 'Focus on pricing.' },
        },
        predecessorApproval: { checkpointId: CHECKPOINT_ID, leaseToken: LEASE_TOKEN },
      }),
    );
    expect(response.headers.get('X-AGI-Tool-Loop')).toBe('resume-paused');
    expect(response.headers.get('X-AGI-Workflow-Run-Id')).toBe('wrun_pause_1');
  });

  it('returns the pause to the user when the turn cannot be validated', async () => {
    mockProcessRequest.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'quota changed' }, { status: 402 }),
    });

    const response = await POST(makeRequest({}), context);

    expect(response.status).toBe(402);
    expect(runMocks.release).toHaveBeenCalledWith(db, {
      userId: 'user-1',
      runId: RUN_ID,
      checkpointId: CHECKPOINT_ID,
      leaseToken: LEASE_TOKEN,
    });
    expect(workflowMocks.start).not.toHaveBeenCalled();
  });

  it('blocks guidance that carries a secret before claiming the pause', async () => {
    secretGate.apply.mockResolvedValueOnce({ action: 'blocked', texts: [] });

    const response = await POST(makeRequest({ guidance: 'sk-live-key' }), context);

    expect(response.status).toBe(400);
    expect(runMocks.claim).not.toHaveBeenCalled();
  });
});
