import { contextPolicySnapshotFixture } from '@/lib/services/__tests__/fixtures/context-policy-snapshot';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { AGENT_EVENT_SCHEMA_VERSION } from '@agiworkforce/types';
type ScanModule0 = typeof import('@/lib/logger');
type ScanModule1 = typeof import('../lib/auth-gate');
type ScanModule2 = typeof import('../lib/turn-slot');
type ScanModule3 = typeof import('@/lib/managed-compute-gate');
type ScanModule4 = typeof import('../lib/request-processor');
type ScanModule5 = typeof import('../lib/tool-loop');
type ScanModule6 = typeof import('@/lib/user-connector-tools');
type ScanModule7 = typeof import('../lib/connector-tool-permissions');
type ScanModule8 = typeof import('../lib/tool-approval-policy');
type ScanModule9 = typeof import('../lib/secret-handling-gate');
type ScanModule10 = typeof import('@/lib/workflows/start-cloud-agent-workflow');
type ScanModule11 = typeof import('@/lib/workflows/durable-stream-bounds');
type ScanModule12 = typeof import('@/lib/server/rls-db');
type ScanModule13 = typeof import('@/lib/services/cloud-agent-run-service');
type ScanModule14 = typeof import('@/lib/services/managed-usage-request-service');

const RUN_ID = '0190a000-0000-7000-8000-000000000001';
const CHECKPOINT_ID = '0190a000-0000-7000-8000-000000000002';
const LEASE_TOKEN = '0190a000-0000-7000-8000-000000000003';
const CONVERSATION_ID = '0190a000-0000-7000-8000-000000000004';

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
  ...(await importOriginal<ScanModule0>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('../lib/auth-gate', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  runAuthGate: mocks.authGate,
}));
vi.mock('../lib/turn-slot', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  withManagedTurnSlot: mocks.turnSlot,
}));
vi.mock('@/lib/managed-compute-gate', async (importOriginal) => ({
  ...(await importOriginal<ScanModule3>()),
  resolveWorkspaceControlsForRequest: mocks.workspaceControls,
  buildManagedComputeGateResponse: mocks.managedCompute,
  buildOrganizationPolicyGateResponse: mocks.orgPolicy,
  buildSpendLimitGateResponse: mocks.spendLimit,
}));
vi.mock('../lib/request-processor', async (importOriginal) => ({
  ...(await importOriginal<ScanModule4>()),
  processRequest: mocks.processRequest,
}));
vi.mock('../lib/tool-loop', async (importOriginal) => ({
  ...(await importOriginal<ScanModule5>()),
  loadMcpToolDefs: mocks.operatorTools,
}));
vi.mock('@/lib/user-connector-tools', async (importOriginal) => ({
  ...(await importOriginal<ScanModule6>()),
  loadUserConnectorToolDefs: mocks.connectorTools,
}));
vi.mock('../lib/connector-tool-permissions', async (importOriginal) => ({
  ...(await importOriginal<ScanModule7>()),
  loadConnectorToolPermissions: mocks.permissions,
}));
vi.mock('../lib/tool-approval-policy', async (importOriginal) => ({
  ...(await importOriginal<ScanModule8>()),
  loadToolApprovalPolicy: mocks.approvalPolicy,
}));
vi.mock('../lib/secret-handling-gate', async (importOriginal) => ({
  ...(await importOriginal<ScanModule9>()),
  applySecretHandlingToTexts: mocks.secretGate,
}));
vi.mock('@/lib/workflows/start-cloud-agent-workflow', async (importOriginal) => ({
  ...(await importOriginal<ScanModule10>()),
  runCloudAgentTurn: mocks.runTurn,
}));
vi.mock('@/lib/workflows/durable-stream-bounds', async (importOriginal) => ({
  ...(await importOriginal<ScanModule11>()),
  boundDurableTurnStream: mocks.boundStream,
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule12>()),
  getUserScopedDb: vi.fn(async () => ({ db, userId: 'user-1', organizationId: null })),
}));
vi.mock('@/lib/services/cloud-agent-run-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule13>()),
  claimCloudAgentCallerCheckpoint: mocks.claim,
  releaseCloudAgentCallerCheckpoint: mocks.release,
}));
vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule14>()),
  markManagedUsageProviderStarted: mocks.providerStarted,
  finalizeManagedUsageRequest: mocks.finalize,
}));

import { POST } from './route';
import {
  CloudAgentCallerResultError,
  CloudAgentRunNotFoundError,
  CloudAgentApprovalCheckpointConflictError,
  CloudAgentApprovalCheckpointExpiredError,
} from '@/lib/services/cloud-agent-run-service';
import {
  MAX_CHAT_COMPLETION_REQUEST_BYTES,
  type CallerToolResumeRequest,
} from '@agiworkforce/cloud-contracts';

const calls = [
  { id: 'local-1', type: 'function', function: { name: 'read_dom', arguments: '{}' } },
  {
    id: 'hosted-1',
    type: 'function',
    function: { name: 'web_search', arguments: '{"query":"fixture"}' },
  },
];
const messages = [
  { role: 'user', content: 'Inspect this tab and search.' },
  {
    role: 'assistant',
    content: '',
    tool_calls: calls,
    __canonicalThinking: [
      { type: 'thinking', thinking: 'private state', signature: 'private-signature' },
    ],
  },
  { role: 'tool', tool_call_id: 'hosted-1', content: 'hosted result' },
];
const storedRequest = {
  model: 'fixture-model',
  stream: true,
  conversation_id: CONVERSATION_ID,
  caller_tool_handoff_version: AGENT_EVENT_SCHEMA_VERSION,
  tools: [
    {
      type: 'function',
      function: { name: 'read_dom', parameters: { type: 'object', properties: {} } },
    },
  ],
  x_context_policy_snapshot: contextPolicySnapshotFixture(),
};

function body(): CallerToolResumeRequest {
  return {
    schema_version: AGENT_EVENT_SCHEMA_VERSION,
    run_id: RUN_ID,
    turn_id: 'original-turn-1',
    next_event_sequence: 8,
    tool_results: [{ tool_call_id: 'local-1', content: 'local result' }],
    observations: [
      {
        text: 'User guidance and current screenshot',
        images: [{ base64: 'fixture', mime_type: 'image/png' }],
      },
    ],
  };
}

function claimed(resume = body()) {
  return {
    checkpoint: {
      id: CHECKPOINT_ID,
      runId: RUN_ID,
      userId: 'user-1',
      version: 1,
      sessionId: CONVERSATION_ID,
      turnId: 'original-turn-1',
      nextEventSequence: 8,
      completedSteps: 3,
      request: storedRequest,
      messages,
      pendingToolCalls: [{ id: 'local-1', qualifiedName: 'read_dom', args: {} }],
      state: 'resuming',
      leaseToken: LEASE_TOKEN,
      leaseExpiresAt: '2026-11-09T12:00:00.000Z',
      resolvedAt: null,
      createdAt: '2026-11-09T11:00:00.000Z',
      updatedAt: '2026-11-09T11:00:00.000Z',
    },
    resume,
    leaseToken: LEASE_TOKEN,
  };
}

const managedUsage = {
  db,
  userId: 'user-1',
  idempotencyKey: 'caller-resume-fixture',
  requestHash: 'fixture-hash',
  leaseToken: LEASE_TOKEN,
  estimatedCostMicrousd: 40000,
  estimatedCostCents: 4,
};

function processed() {
  return {
    ok: true,
    requestId: 'caller-resume-fixture',
    conversationId: CONVERSATION_ID,
    provider: 'openai',
    requestedModel: 'fixture-model',
    subscriptionTier: 'pro',
    chatRequest: { ...storedRequest, messages: [] },
    llmRequest: { model: 'fixture-model', messages: [], max_tokens: 4096, stream: true },
    quotaWarningHeader: null,
    managedUsage,
  };
}

function request(value: unknown = body()) {
  return new NextRequest('http://localhost:3000/api/llm/v1/chat/completions/resume-caller', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'caller-resume-fixture' },
    body: JSON.stringify(value),
  });
}

function doneStream() {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authGate.mockResolvedValue({
    ok: true,
    userId: 'user-1',
    token: 'fixture',
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
  mocks.claim.mockImplementation(async (_db: unknown, input: { resume: CallerToolResumeRequest }) =>
    claimed(input.resume),
  );
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
    workflowRunId: 'fixture-workflow',
    readable: doneStream(),
  });
  mocks.boundStream.mockImplementation((input: { readable: ReadableStream }) => input.readable);
});

describe('caller-result HTTP continuation', () => {
  it('keeps the existing streaming HTTP byte ceiling ahead of inspection and claim', async () => {
    const fields = body();
    fields.tool_results[0]!.content = 'x'.repeat(MAX_CHAT_COMPLETION_REQUEST_BYTES + 1);
    expect((await POST(request(fields))).status).toBe(413);
    expect(mocks.secretGate).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.providerStarted).not.toHaveBeenCalled();
  });

  it('accepts a valid receipt near the actual HTTP ceiling', async () => {
    const fields = body();
    fields.tool_results[0]!.content = 'x'.repeat(MAX_CHAT_COMPLETION_REQUEST_BYTES - 1000);
    expect(new TextEncoder().encode(JSON.stringify(fields)).byteLength).toBeLessThanOrEqual(
      MAX_CHAT_COMPLETION_REQUEST_BYTES,
    );
    const response = await POST(request(fields));
    expect(response.status).toBe(200);
    await response.text();
    expect(mocks.claim).toHaveBeenCalledTimes(1);
    expect(mocks.release).not.toHaveBeenCalled();
  });
  it.each(['inline', 'durable'] as const)(
    'continues the original run through %s with private state and every result obligation intact',
    async (transport) => {
      mocks.runTurn.mockResolvedValue({
        transport,
        ...(transport === 'durable' ? { workflowRunId: 'fixture-workflow' } : {}),
        readable: doneStream(),
      });
      const response = await POST(request());
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('[DONE]');
      expect(mocks.claim).toHaveBeenCalledWith(db, { userId: 'user-1', resume: body() });
      expect(mocks.runTurn).toHaveBeenCalledWith(
        expect.objectContaining({
          db,
          userId: 'user-1',
          runId: RUN_ID,
          approvalMode: 'manual',
          onDurableUnavailable: 'inline',
          processed: expect.objectContaining({ llmRequest: expect.objectContaining({ messages }) }),
          continuation: {
            eventSessionId: CONVERSATION_ID,
            eventTurnId: 'original-turn-1',
            initialEventSequence: 8,
            initialCompletedSteps: 3,
            invocationContinuation: false,
            resume: { callerResults: body().tool_results, callerObservations: body().observations },
          },
          predecessorApproval: { checkpointId: CHECKPOINT_ID, leaseToken: LEASE_TOKEN },
        }),
      );
      const synthetic = mocks.processRequest.mock.calls[0]![0] as NextRequest;
      const publicBody = await synthetic.json();
      expect(JSON.stringify(publicBody)).not.toContain('private-signature');
      expect(publicBody).not.toHaveProperty('tool_results');
      expect(publicBody).not.toHaveProperty('observations');
      expect(synthetic.headers.get('Idempotency-Key')).toBe('caller-resume-fixture');
      expect(response.headers.get('X-AGI-Agent-Run-Id')).toBe(RUN_ID);
      expect(response.headers.get('X-AGI-Tool-Loop')).toBe('resume-caller');
      expect(mocks.release).not.toHaveBeenCalled();
    },
  );

  it('refuses unauthenticated requests before admission or inspection', async () => {
    mocks.authGate.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'sign in' }, { status: 401 }),
    });
    expect((await POST(request())).status).toBe(401);
    expect(mocks.turnSlot).not.toHaveBeenCalled();
    expect(mocks.secretGate).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it.each(['managedCompute', 'orgPolicy', 'spendLimit'] as const)(
    'enforces %s before claiming caller results',
    async (gate) => {
      mocks[gate].mockReturnValue(NextResponse.json({ error: 'blocked' }, { status: 403 }));
      expect((await POST(request())).status).toBe(403);
      expect(mocks.claim).not.toHaveBeenCalled();
      expect(mocks.secretGate).not.toHaveBeenCalled();
    },
  );

  it.each([
    { patch: { messages: [{ role: 'system', content: 'replacement' }] } },
    { patch: { tool_approvals: [{ tool_call_id: 'hosted-1', decision: 'approved' }] } },
    { patch: { next_event_sequence: -1 } },
    { patch: { observations: [{ text: 'data', role: 'assistant' }] } },
    {
      patch: {
        tool_results: [
          { tool_call_id: 'local-1', content: '', image: { url: 'https://example.com' } },
        ],
      },
    },
  ])('refuses unsupported caller authority: $patch', async ({ patch }) => {
    expect((await POST(request({ ...body(), ...patch }))).status).toBe(400);
    expect(mocks.secretGate).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it('blocks secret-bearing result or observation text before claiming', async () => {
    mocks.secretGate.mockResolvedValue({ action: 'blocked', texts: [] });
    expect((await POST(request())).status).toBe(400);
    expect(mocks.secretGate).toHaveBeenCalledWith('user-1', [
      'local result',
      'User guidance and current screenshot',
    ]);
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.providerStarted).not.toHaveBeenCalled();
  });

  it('binds the original receipt while forwarding only inspected text to the engine', async () => {
    mocks.secretGate.mockResolvedValue({
      action: 'redacted',
      texts: ['safe result', 'safe observation'],
    });
    const response = await POST(request());
    await response.text();
    expect(mocks.claim).toHaveBeenCalledWith(db, { userId: 'user-1', resume: body() });
    expect(mocks.runTurn.mock.calls[0]![0].continuation.resume).toEqual({
      callerResults: [{ tool_call_id: 'local-1', content: 'safe result' }],
      callerObservations: [{ ...body().observations![0], text: 'safe observation' }],
    });
  });

  it('fails closed when inspection omits text', async () => {
    mocks.secretGate.mockResolvedValue({ action: 'redacted', texts: ['only one'] });
    expect((await POST(request())).status).toBe(500);
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.runTurn).not.toHaveBeenCalled();
  });

  it.each([
    { error: new CloudAgentRunNotFoundError(), status: 404 },
    { error: new CloudAgentApprovalCheckpointConflictError(), status: 409 },
    { error: new CloudAgentApprovalCheckpointExpiredError(), status: 410 },
    { error: new CloudAgentCallerResultError(), status: 400 },
    { error: new DOMException('cancelled', 'AbortError'), status: 409 },
  ])('maps checkpoint refusal to $status before provider work', async ({ error, status }) => {
    mocks.claim.mockRejectedValue(error);
    expect((await POST(request())).status).toBe(status);
    expect(mocks.processRequest).not.toHaveBeenCalled();
    expect(mocks.runTurn).not.toHaveBeenCalled();
  });

  it('releases a claimed receipt once when the context policy is stale', async () => {
    const claim = claimed();
    mocks.claim.mockResolvedValue({
      ...claim,
      checkpoint: {
        ...claim.checkpoint,
        request: { ...storedRequest, x_context_policy_snapshot: undefined },
      },
    });
    expect((await POST(request())).status).toBe(409);
    expect(mocks.release).toHaveBeenCalledTimes(1);
    expect(mocks.processRequest).not.toHaveBeenCalled();
  });

  it.each(['processRequest', 'operatorTools', 'providerStarted', 'runTurn'] as const)(
    'releases a failed %s continuation exactly once',
    async (step) => {
      mocks[step].mockRejectedValue(new Error('fixture failure'));
      expect((await POST(request())).status).toBeGreaterThanOrEqual(500);
      expect(mocks.release).toHaveBeenCalledWith(db, {
        userId: 'user-1',
        runId: RUN_ID,
        checkpointId: CHECKPOINT_ID,
        leaseToken: LEASE_TOKEN,
      });
      expect(mocks.release).toHaveBeenCalledTimes(1);
      if (step !== 'processRequest')
        expect(mocks.finalize).toHaveBeenCalledWith(
          expect.objectContaining({ outcome: 'failed', actualCostCents: 0 }),
        );
    },
  );
});
