import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const workflowMocks = vi.hoisted(() => ({
  start: vi.fn(),
  attach: vi.fn(),
  buildInput: vi.fn(),
  runToolLoop: vi.fn(),
  buildStream: vi.fn(),
  saveApproval: vi.fn(async () => undefined),
  saveInput: vi.fn(async () => undefined),
  completeCheckpoint: vi.fn(async () => undefined),
  autoMemory: vi.fn(async () => undefined),
  connectorExecutor: vi.fn(),
}));

vi.mock('workflow/api', () => ({ start: workflowMocks.start }));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/services/cloud-agent-execution-service', () => ({
  attachCloudAgentWorkflow: workflowMocks.attach,
}));
// Only `buildCloudAgentWorkflowInput` is stubbed. The REAL
// `CloudAgentWorkflowBillingUnavailableError` is kept deliberately: production
// distinguishes "this turn is not billable" from "the platform is down" with an
// `instanceof` check, and a locally-declared fake would make that check pass for
// the wrong reason.
vi.mock('./cloud-agent-workflow-input', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./cloud-agent-workflow-input')>()),
  buildCloudAgentWorkflowInput: workflowMocks.buildInput,
}));
vi.mock('./cloud-agent-workflow', () => ({ cloudAgentWorkflow: vi.fn() }));
vi.mock('@/app/api/llm/v1/chat/completions/lib/tool-loop', () => ({
  runToolLoop: workflowMocks.runToolLoop,
}));
vi.mock('@/app/api/llm/v1/chat/completions/lib/managed-agent-stream', () => ({
  buildManagedAgentStream: workflowMocks.buildStream,
}));
vi.mock('@/app/api/llm/v1/chat/completions/lib/managed-failover', () => ({
  createFailoverPlan: () => ({ next: () => null }),
}));
vi.mock('@/app/api/llm/v1/chat/completions/lib/adapter-providers', () => ({
  ADAPTER_PROVIDERS: {},
}));
vi.mock('@/app/api/llm/v1/chat/completions/lib/approval-checkpoint-request', () => ({
  buildApprovalCheckpointRequest: (request: unknown) => request,
}));
vi.mock('@/lib/services/cloud-agent-run-service', () => ({
  appendCloudAgentEvent: vi.fn(),
  completeCloudAgentApprovalCheckpoint: workflowMocks.completeCheckpoint,
  getCloudAgentRun: vi.fn(),
  isCloudAgentRunCancellationRequested: vi.fn(async () => false),
  recordCloudAgentRunSettledUsage: vi.fn(),
  saveCloudAgentApprovalCheckpoint: workflowMocks.saveApproval,
  saveCloudAgentInputCheckpoint: workflowMocks.saveInput,
  transitionCloudAgentRun: vi.fn(),
}));
vi.mock('@/lib/services/managed-usage-accounting-service', () => ({
  createObservedProviderUsage: () => ({
    providerCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    cacheWrite1hTokens: 0,
    reasoningTokens: 0,
  }),
  calculateObservedProviderUsageCostDollars: vi.fn(() => 0),
  finalizeObservedManagedUsage: vi.fn(),
  mergeObservedProviderUsage: vi.fn(),
}));
vi.mock('@/lib/services/managed-auto-memory-service', () => ({
  recordManagedAutoMemoryTurn: workflowMocks.autoMemory,
}));
vi.mock('@/lib/user-connector-tools', () => ({
  makeUserConnectorExecutor: workflowMocks.connectorExecutor,
}));

import { runCloudAgentTurn, startCloudAgentWorkflowExecution } from './start-cloud-agent-workflow';
import { CloudAgentWorkflowBillingUnavailableError } from './cloud-agent-workflow-input';
import {
  recordDurableTransportClaim,
  recordDurableTransportStall,
} from './durable-stream-liveness';

const RUN_ID = '0190a000-0000-7000-8000-000000000001';
const CHECKPOINT_ID = '0190a000-0000-7000-8000-000000000004';
const LEASE_TOKEN = '0190a000-0000-7000-8000-000000000005';

const db = { query: vi.fn(), execute: vi.fn(), transaction: vi.fn() } as never;

function baseInput() {
  return {
    db,
    runId: RUN_ID,
    userId: 'user-1',
    processed: {
      requestId: 'agi.chat.web.send.turn-1',
      chatRequest: { model: 'claude-test', messages: [] },
      organizationId: null,
    } as never,
    mcpTools: [],
    approvalMode: 'auto' as const,
  };
}

function turnInput(overrides: Record<string, unknown> = {}) {
  return {
    ...baseInput(),
    onDurableUnavailable: 'inline' as const,
    signal: new AbortController().signal,
    completionReason: 'tool_loop_resume_completed',
    cancellationReason: 'client_cancelled_tool_loop_resume',
    ...overrides,
  };
}

/** The options object the inline path handed `runToolLoop`. */
function toolLoopOptions(): Record<string, unknown> {
  return workflowMocks.runToolLoop.mock.calls[0]![1] as Record<string, unknown>;
}

/** The input the inline path handed `buildManagedAgentStream`. */
function streamInput(): Record<string, unknown> {
  return workflowMocks.buildStream.mock.calls[0]![0] as Record<string, unknown>;
}

describe('cloud agent workflow starter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('starts, durably attaches, and returns the replayable workflow stream', async () => {
    const readable = new ReadableStream<Uint8Array>();
    const workflowRun = {
      runId: 'wrun_123',
      getReadable: vi.fn(() => readable),
      cancel: vi.fn(),
    };
    workflowMocks.buildInput.mockReturnValue({ version: 1 });
    workflowMocks.start.mockResolvedValue(workflowRun);
    workflowMocks.attach.mockResolvedValue(undefined);

    await expect(startCloudAgentWorkflowExecution(baseInput())).resolves.toEqual({
      workflowRunId: 'wrun_123',
      readable,
      cancel: expect.any(Function),
    });

    expect(workflowMocks.start).toHaveBeenCalledWith(expect.any(Function), [{ version: 1 }]);
    expect(workflowMocks.attach).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ workflowRunId: 'wrun_123' }),
    );
  });

  it('cancels a started workflow when the durable attachment fails', async () => {
    const workflowRun = {
      runId: 'wrun_123',
      getReadable: vi.fn(),
      cancel: vi.fn().mockResolvedValue(undefined),
    };
    workflowMocks.buildInput.mockReturnValue({ version: 1 });
    workflowMocks.start.mockResolvedValue(workflowRun);
    workflowMocks.attach.mockRejectedValue(new Error('attach failed'));

    await expect(startCloudAgentWorkflowExecution(baseInput())).rejects.toThrow('attach failed');
    expect(workflowRun.cancel).toHaveBeenCalledOnce();
  });
});

/**
 * AGI-39. `approve/` and `resume-input/` used to start the durable workflow with
 * no fallback at all, so any Workflow-platform failure -- or the
 * AGI_DURABLE_INITIAL_TURNS kill-switch being engaged -- turned every pending
 * approval and input resume into a permanent 503. The capability to run that
 * resume request-scoped already existed in `runToolLoop`; it was simply not
 * reachable from those entry points.
 */
describe('runCloudAgentTurn transport selection', () => {
  const inlineStream = new ReadableStream<Uint8Array>();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    recordDurableTransportClaim();
    workflowMocks.buildInput.mockReturnValue({ version: 1 });
    workflowMocks.runToolLoop.mockReturnValue((async function* () {})());
    workflowMocks.buildStream.mockReturnValue(inlineStream);
  });

  afterEach(() => vi.unstubAllEnvs());

  it('uses the durable transport when the platform accepts the turn', async () => {
    const readable = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: open\n\n'));
        controller.close();
      },
    });
    workflowMocks.start.mockResolvedValue({
      runId: 'wrun_durable',
      getReadable: () => readable,
      cancel: vi.fn(),
    });
    workflowMocks.attach.mockResolvedValue(undefined);

    const result = await runCloudAgentTurn(turnInput());
    expect(result.transport).toBe('durable');
    expect(result.workflowRunId).toBe('wrun_durable');
    expect(result.degradedReason).toBeUndefined();
    expect(workflowMocks.runToolLoop).not.toHaveBeenCalled();
  });

  it('serves the turn inline when the durable stream never opens', async () => {
    const cancel = vi.fn();
    workflowMocks.start.mockResolvedValue({
      runId: 'wrun_stalled',
      getReadable: () => new ReadableStream<Uint8Array>({ start() {} }),
      cancel,
    });
    workflowMocks.attach.mockResolvedValue(undefined);

    const result = await runCloudAgentTurn(turnInput());
    expect(result.transport).toBe('inline');
    expect(result.degradedReason).toBe('workflow_stream_stalled');
    // The stalled durable run is cancelled BEFORE the inline turn is built, or
    // the same turn runs twice and settles twice.
    expect(cancel).toHaveBeenCalledOnce();
    expect(cancel.mock.invocationCallOrder[0]!).toBeLessThan(
      workflowMocks.runToolLoop.mock.invocationCallOrder[0]!,
    );
  }, 20_000);

  it('skips the platform entirely while the transport is cooling down', async () => {
    recordDurableTransportStall();

    const turn = await runCloudAgentTurn(turnInput());

    expect(turn).toMatchObject({ transport: 'inline', degradedReason: 'transport_cooling_down' });
    expect(workflowMocks.start).not.toHaveBeenCalled();
    expect(workflowMocks.runToolLoop).toHaveBeenCalledOnce();
  });

  it('rethrows the cooldown for a caller that asked to answer for it itself', async () => {
    recordDurableTransportStall();

    await expect(runCloudAgentTurn(turnInput({ onDurableUnavailable: 'fail' }))).rejects.toThrow(
      'transport_cooling_down',
    );
  });

  it('serves the turn inline when the durable platform refuses it', async () => {
    workflowMocks.start.mockRejectedValue(new Error('workflow storage unavailable'));

    const turn = await runCloudAgentTurn(turnInput());

    expect(turn).toEqual({
      transport: 'inline',
      workflowRunId: null,
      readable: inlineStream,
      degradedReason: 'workflow_start_failed',
    });
    expect(workflowMocks.runToolLoop).toHaveBeenCalledOnce();
  });

  it('serves the turn inline when the durable kill-switch is engaged', async () => {
    vi.stubEnv('AGI_DURABLE_INITIAL_TURNS', '0');

    const turn = await runCloudAgentTurn(turnInput());

    expect(turn).toMatchObject({ transport: 'inline', degradedReason: 'kill_switch' });
    // The kill-switch must not even reach the platform.
    expect(workflowMocks.start).not.toHaveBeenCalled();
    expect(workflowMocks.runToolLoop).toHaveBeenCalledOnce();
  });

  it('serves the turn inline when it carries no reservation to replay', async () => {
    workflowMocks.buildInput.mockImplementation(() => {
      throw new CloudAgentWorkflowBillingUnavailableError();
    });

    const turn = await runCloudAgentTurn(turnInput());

    expect(turn).toMatchObject({ transport: 'inline', degradedReason: 'no_reservation' });
  });

  it('rethrows for a caller that asked to answer for the failure itself', async () => {
    workflowMocks.start.mockRejectedValue(new Error('workflow storage unavailable'));

    await expect(runCloudAgentTurn(turnInput({ onDurableUnavailable: 'fail' }))).rejects.toThrow(
      'workflow storage unavailable',
    );
    expect(workflowMocks.runToolLoop).not.toHaveBeenCalled();
  });

  it('replays the same resume through the inline loop, not a lesser one', async () => {
    workflowMocks.start.mockRejectedValue(new Error('down'));
    const resume = { approvals: [{ toolCallId: 'call_1', decision: 'approved' as const }] };

    await runCloudAgentTurn(
      turnInput({
        continuation: {
          eventSessionId: 'session-1',
          eventTurnId: 'turn-1',
          initialEventSequence: 9,
          initialCompletedSteps: 2,
          invocationContinuation: false,
          resume,
        },
      }),
    );

    expect(toolLoopOptions()).toMatchObject({
      resume,
      eventSessionId: 'session-1',
      eventTurnId: 'turn-1',
      initialEventSequence: 9,
      initialCompletedSteps: 2,
      invocationContinuation: false,
    });
  });
});

/**
 * The invariant: every NON-TERMINAL exit records an invocation boundary. A
 * degraded turn does real work, so if it parks the run without writing a
 * checkpoint, that work is lost and the run can never be resumed.
 */
describe('the inline transport records every non-terminal boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workflowMocks.buildInput.mockReturnValue({ version: 1 });
    workflowMocks.start.mockRejectedValue(new Error('down'));
    workflowMocks.runToolLoop.mockReturnValue((async function* () {})());
    workflowMocks.buildStream.mockReturnValue(new ReadableStream<Uint8Array>());
  });

  it('writes an approval checkpoint when the loop pauses for approval', async () => {
    await runCloudAgentTurn(turnInput());

    const onApprovalCheckpoint = toolLoopOptions()['onApprovalCheckpoint'] as (
      checkpoint: unknown,
    ) => Promise<void>;
    await onApprovalCheckpoint({
      sessionId: 'session-1',
      turnId: 'turn-1',
      nextEventSequence: 6,
      completedSteps: 1,
      messages: [{ role: 'user', content: 'hi' }],
      pendingToolCalls: [{ id: 'call_1', qualifiedName: 'mcp__github__x', args: {} }],
      events: [],
    });

    expect(workflowMocks.saveApproval).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ userId: 'user-1', runId: RUN_ID, nextEventSequence: 6 }),
    );
    expect(streamInput()['preserveAwaitingInputOnCancel']).toBeTypeOf('function');
    expect((streamInput()['preserveAwaitingInputOnCancel'] as () => boolean)()).toBe(true);
  });

  it('writes an input checkpoint when the loop pauses on MCP input_required', async () => {
    await runCloudAgentTurn(turnInput());

    const onInputCheckpoint = toolLoopOptions()['onInputCheckpoint'] as (
      checkpoint: unknown,
    ) => Promise<void>;
    await onInputCheckpoint({
      sessionId: 'session-1',
      turnId: 'turn-1',
      nextEventSequence: 7,
      completedSteps: 1,
      messages: [],
      pendingToolCalls: [{ id: 'call_1', qualifiedName: 'mcp__x__y', args: {} }],
      inputRequests: { call_1: { priority: {} } },
      requestState: { call_1: { requestState: 'token-1', round: 1 } },
      events: [],
    });

    expect(workflowMocks.saveInput).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        runId: RUN_ID,
        inputRequests: { call_1: { priority: {} } },
        requestState: { call_1: { requestState: 'token-1', round: 1 } },
      }),
    );
  });

  it('resolves the predecessor lease it resumed from, exactly as the durable settle does', async () => {
    await runCloudAgentTurn(
      turnInput({ predecessorApproval: { checkpointId: CHECKPOINT_ID, leaseToken: LEASE_TOKEN } }),
    );

    const onTerminal = streamInput()['onTerminal'] as (outcome: string) => Promise<void>;
    await onTerminal('completed');

    expect(workflowMocks.completeCheckpoint).toHaveBeenCalledWith(db, {
      userId: 'user-1',
      checkpointId: CHECKPOINT_ID,
      leaseToken: LEASE_TOKEN,
      outcome: 'resolved',
    });
  });

  it('marks the predecessor lease failed when the degraded turn fails', async () => {
    await runCloudAgentTurn(
      turnInput({ predecessorApproval: { checkpointId: CHECKPOINT_ID, leaseToken: LEASE_TOKEN } }),
    );

    const onTerminal = streamInput()['onTerminal'] as (outcome: string) => Promise<void>;
    await onTerminal('failed');

    expect(workflowMocks.completeCheckpoint).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ outcome: 'failed' }),
    );
  });

  it('journals the inline turn against the same run the durable one would have', async () => {
    await runCloudAgentTurn(turnInput());

    expect(streamInput()['runJournal']).toEqual({ db, userId: 'user-1', runId: RUN_ID });
  });
});
