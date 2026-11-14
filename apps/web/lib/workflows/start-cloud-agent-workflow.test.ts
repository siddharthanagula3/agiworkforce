import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('./cloud-agent-workflow-input');
type ScanModule1 = typeof import('@/app/api/llm/v1/chat/completions/lib/managed-failover');

vi.mock('server-only', () => ({}));

const workflowMocks = vi.hoisted(() => ({
  start: vi.fn(),
  attach: vi.fn(),
  buildInput: vi.fn(),
  runToolLoop: vi.fn(),
  cancellationRequested: vi.fn(async () => false),
  buildStream: vi.fn(),
  saveApproval: vi.fn(async () => undefined),
  saveInput: vi.fn(async () => undefined),
  saveCaller: vi.fn(async (_db: unknown, input: { events: unknown[] }) => ({
    events: input.events,
  })),
  completeCheckpoint: vi.fn(async () => undefined),
  autoMemory: vi.fn(async () => undefined),
  connectorExecutor: vi.fn(),
  assertCapabilityAvailable: vi.fn(
    async (_subject: unknown, _capability: string, _label: string) => undefined,
  ),
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
  ...(await importOriginal<ScanModule0>()),
  buildCloudAgentWorkflowInput: workflowMocks.buildInput,
}));
vi.mock('./cloud-agent-workflow', () => ({ cloudAgentWorkflow: vi.fn() }));
vi.mock('@/app/api/llm/v1/chat/completions/lib/tool-loop', () => ({
  runToolLoop: workflowMocks.runToolLoop,
}));
vi.mock('@/app/api/llm/v1/chat/completions/lib/managed-agent-stream', () => ({
  buildManagedAgentStream: workflowMocks.buildStream,
}));
vi.mock('@/app/api/llm/v1/chat/completions/lib/managed-failover', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  createFailoverPlan: () => ({ next: () => null }),
}));
vi.mock('@/app/api/llm/v1/chat/completions/lib/adapter-providers', () => ({
  ADAPTER_PROVIDERS: {},
}));
vi.mock('@/app/api/llm/v1/chat/completions/lib/approval-checkpoint-request', () => ({
  buildApprovalCheckpointRequest: (request: unknown) => request,
}));
vi.mock('@/lib/services/cloud-agent-run-service', () => ({
  readCloudAgentRunAssistantText: vi.fn(async () => ({
    text: '',
    interactiveCards: [],
    lastSequence: 0,
  })),
  takeCloudAgentRunSteers: vi.fn(async () => []),
  APPROVAL_CHECKPOINT_TTL_HOURS: 24,
  appendCloudAgentEvent: vi.fn(),
  completeCloudAgentApprovalCheckpoint: workflowMocks.completeCheckpoint,
  getCloudAgentRun: vi.fn(),
  isCloudAgentRunCancellationRequested: workflowMocks.cancellationRequested,
  isCloudAgentRunPauseRequested: vi.fn(async () => false),
  saveCloudAgentPauseCheckpoint: vi.fn(),
  recordCloudAgentRunSettledUsage: vi.fn(),
  saveCloudAgentApprovalCheckpoint: workflowMocks.saveApproval,
  saveCloudAgentCallerCheckpoint: workflowMocks.saveCaller,
  saveCloudAgentInputCheckpoint: workflowMocks.saveInput,
  saveCloudAgentDeviceCheckpoint: vi.fn(),
  transitionCloudAgentRun: vi.fn(),
}));
vi.mock('@/lib/services/managed-usage-accounting-service', () => ({
  accumulateObservedProviderUsage: vi.fn(),
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
  hasObservedProviderUsage: vi.fn(() => false),
  mergeObservedProviderUsage: vi.fn(),
  addToolSpend: vi.fn(),
  observedTurnCost: vi.fn(() => ({ tokenMicrousd: 0, toolMicrousd: 0 })),
}));
vi.mock('@/lib/services/managed-auto-memory-service', () => ({
  recordManagedAutoMemoryTurn: workflowMocks.autoMemory,
}));
vi.mock('@/lib/user-connector-tools', () => ({
  makeUserConnectorExecutor: workflowMocks.connectorExecutor,
}));
vi.mock('@/lib/feature-flags/capability-gate', () => ({
  assertCapabilityAvailable: workflowMocks.assertCapabilityAvailable,
}));

import {
  CLOUD_AGENT_CANCELLATION_POLL_MS,
  WORKFLOW_WORLD_CALL_DEADLINE_MS,
} from '@/lib/deadline-policy';
import { createError } from '@/lib/errors';
import { CloudAgentCapabilityRefusedError } from './cloud-agent-capability-refusal';
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

function workInput() {
  const input = baseInput();
  return {
    ...input,
    processed: {
      ...(input.processed as unknown as Record<string, unknown>),
      chatRequest: { model: 'claude-test', messages: [], work_mode: 'agiwork' },
    } as never,
  };
}

function workSwitchedOff() {
  return createError
    .serviceUnavailable('Work is temporarily switched off while we investigate a problem with it.')
    .asUserSafe();
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

  it('traces the enqueue with the durable job id and the run it serves', async () => {
    const { logger } = await import('@/lib/logger');
    workflowMocks.buildInput.mockReturnValue({ version: 1 });
    workflowMocks.start.mockResolvedValue({
      runId: 'wrun_traced',
      getReadable: vi.fn(() => new ReadableStream<Uint8Array>()),
      cancel: vi.fn(),
    });
    workflowMocks.attach.mockResolvedValue(undefined);

    await startCloudAgentWorkflowExecution(baseInput());

    const record = vi
      .mocked(logger.info)
      .mock.calls.map((call) => call[0] as unknown as Record<string, unknown>)
      .find((entry) => entry['span_name'] === 'workflow.enqueue');
    expect(record).toMatchObject({
      span_kind: 'producer',
      'messaging.destination.name': 'cloud-agent-turn',
      'messaging.message.id': 'wrun_traced',
      'agi.run.id': RUN_ID,
      'agi.turn.id': 'agi.chat.web.send.turn-1',
    });
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

  it('reports an admitted run it could not stop instead of the attachment error', async () => {
    const workflowRun = {
      runId: 'wrun_123',
      getReadable: vi.fn(),
      cancel: vi.fn().mockRejectedValue(new Error('cancel refused')),
    };
    workflowMocks.buildInput.mockReturnValue({ version: 1 });
    workflowMocks.start.mockResolvedValue(workflowRun);
    workflowMocks.attach.mockRejectedValue(new Error('attach failed'));

    await expect(startCloudAgentWorkflowExecution(baseInput())).rejects.toMatchObject({
      name: 'CloudAgentWorkflowUncertainStartError',
      workflowRunId: 'wrun_123',
    });
  });

  it('gives up on a platform start that never answers', async () => {
    vi.useFakeTimers();
    try {
      workflowMocks.buildInput.mockReturnValue({ version: 1 });
      workflowMocks.start.mockReturnValue(new Promise(() => undefined));

      const pending = startCloudAgentWorkflowExecution(baseInput());
      const outcome = expect(pending).rejects.toThrow('timed out');
      await vi.advanceTimersByTimeAsync(WORKFLOW_WORLD_CALL_DEADLINE_MS);
      await outcome;
      expect(workflowMocks.attach).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('bounds a cancel the platform never acknowledges', async () => {
    vi.useFakeTimers();
    try {
      const workflowRun = {
        runId: 'wrun_123',
        getReadable: vi.fn(() => new ReadableStream<Uint8Array>()),
        cancel: vi.fn(() => new Promise<void>(() => undefined)),
      };
      workflowMocks.buildInput.mockReturnValue({ version: 1 });
      workflowMocks.start.mockResolvedValue(workflowRun);
      workflowMocks.attach.mockResolvedValue(undefined);

      const started = await startCloudAgentWorkflowExecution(baseInput());
      const outcome = expect(started.cancel()).rejects.toThrow('timed out');
      await vi.advanceTimersByTimeAsync(WORKFLOW_WORLD_CALL_DEADLINE_MS);
      await outcome;
      expect(workflowRun.cancel).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
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
describe('the Work kill switch', () => {
  beforeEach(() => vi.clearAllMocks());

  it('asks about Work before it starts anything', async () => {
    workflowMocks.start.mockResolvedValue({
      runId: 'wf-1',
      getReadable: () => ({}) as never,
      cancel: vi.fn(),
    });
    workflowMocks.attach.mockResolvedValue(undefined);

    await startCloudAgentWorkflowExecution(workInput());

    const [subject, capability, label] = workflowMocks.assertCapabilityAvailable.mock.calls[0]!;
    expect(capability).toBe('canUseAgiWork');
    expect(label).toBe('Work');
    expect(subject).toMatchObject({ userId: 'user-1', workspaceId: null });
  });

  it('does not ask about Work for a turn that is not Work', async () => {
    workflowMocks.start.mockResolvedValue({
      runId: 'wf-1',
      getReadable: () => ({}) as never,
      cancel: vi.fn(),
    });
    workflowMocks.attach.mockResolvedValue(undefined);

    await startCloudAgentWorkflowExecution(baseInput());

    expect(workflowMocks.assertCapabilityAvailable).not.toHaveBeenCalled();
  });

  it('starts no run and attaches nothing when Work is switched off', async () => {
    workflowMocks.assertCapabilityAvailable.mockRejectedValueOnce(workSwitchedOff());

    await expect(startCloudAgentWorkflowExecution(workInput())).rejects.toBeInstanceOf(
      CloudAgentCapabilityRefusedError,
    );
    expect(workflowMocks.start).not.toHaveBeenCalled();
    expect(workflowMocks.attach).not.toHaveBeenCalled();
  });

  it('keeps a failure to read the switch apart from the switch saying no', async () => {
    workflowMocks.assertCapabilityAvailable.mockRejectedValueOnce(new Error('flag store down'));

    const outcome = startCloudAgentWorkflowExecution(workInput());

    await expect(outcome).rejects.toThrow('flag store down');
    await expect(outcome).rejects.not.toBeInstanceOf(CloudAgentCapabilityRefusedError);
  });

  it('carries the workspace, so a switch closed for one tenant is asked per tenant', async () => {
    workflowMocks.start.mockResolvedValue({
      runId: 'wf-1',
      getReadable: () => ({}) as never,
      cancel: vi.fn(),
    });
    workflowMocks.attach.mockResolvedValue(undefined);
    const input = workInput();
    (input.processed as unknown as { organizationId: string | null }).organizationId = 'org-9';

    await startCloudAgentWorkflowExecution(input);

    expect(workflowMocks.assertCapabilityAvailable.mock.calls[0]![0]).toMatchObject({
      workspaceId: 'org-9',
    });
  });
});

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

  it('never runs the turn inline when the stalled durable run cannot be cancelled', async () => {
    const cancel = vi.fn().mockRejectedValue(new Error('cancel refused'));
    workflowMocks.start.mockResolvedValue({
      runId: 'wrun_uncancellable',
      getReadable: () => new ReadableStream<Uint8Array>({ start() {} }),
      cancel,
    });
    workflowMocks.attach.mockResolvedValue(undefined);

    const result = await runCloudAgentTurn(turnInput());

    expect(cancel).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      transport: 'durable',
      workflowRunId: 'wrun_uncancellable',
      degradedReason: 'workflow_stream_stalled',
    });
    expect(workflowMocks.runToolLoop).not.toHaveBeenCalled();
    expect(workflowMocks.buildStream).not.toHaveBeenCalled();
    const frames = await new Response(result.readable).text();
    expect(frames).toContain(`"x_run_detached":{"run_id":"${RUN_ID}"`);
    expect(frames).toContain('[DONE]');
  }, 20_000);

  it('never runs the turn inline when a failed attachment cannot cancel the started run', async () => {
    const cancel = vi.fn().mockRejectedValue(new Error('cancel refused'));
    workflowMocks.start.mockResolvedValue({
      runId: 'wrun_unattached',
      getReadable: vi.fn(),
      cancel,
    });
    workflowMocks.attach.mockRejectedValue(new Error('attach failed'));

    const result = await runCloudAgentTurn(turnInput());

    expect(result).toMatchObject({ transport: 'durable', workflowRunId: 'wrun_unattached' });
    expect(workflowMocks.runToolLoop).not.toHaveBeenCalled();
    expect(workflowMocks.buildStream).not.toHaveBeenCalled();
  });

  it('answers for an uncancellable stalled run itself when the caller asked to', async () => {
    workflowMocks.start.mockResolvedValue({
      runId: 'wrun_uncancellable',
      getReadable: () => new ReadableStream<Uint8Array>({ start() {} }),
      cancel: vi.fn().mockRejectedValue(new Error('cancel refused')),
    });
    workflowMocks.attach.mockResolvedValue(undefined);

    await expect(runCloudAgentTurn(turnInput({ onDurableUnavailable: 'fail' }))).rejects.toThrow(
      'workflow_stream_stalled',
    );
    expect(workflowMocks.runToolLoop).not.toHaveBeenCalled();
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

  it('aborts an active inline provider stream when its run is stopped', async () => {
    vi.useFakeTimers();
    const parent = new AbortController();
    let reading: Promise<IteratorResult<Uint8Array, unknown>> | undefined;
    let signal: AbortSignal | undefined;
    try {
      recordDurableTransportStall();
      workflowMocks.cancellationRequested.mockResolvedValue(false);
      workflowMocks.runToolLoop.mockImplementationOnce((_processed, options) => {
        signal = options.signal;
        return (async function* () {
          await new Promise<void>((resolve) =>
            signal!.addEventListener('abort', () => resolve(), { once: true }),
          );
          yield* [];
        })();
      });
      await runCloudAgentTurn(turnInput({ signal: parent.signal }));
      reading = (streamInput()['generator'] as AsyncGenerator<Uint8Array>).next();
      await vi.advanceTimersByTimeAsync(CLOUD_AGENT_CANCELLATION_POLL_MS);
      expect(signal?.aborted).toBe(false);
      workflowMocks.cancellationRequested.mockResolvedValue(true);
      await vi.advanceTimersByTimeAsync(CLOUD_AGENT_CANCELLATION_POLL_MS);
      expect(signal?.aborted).toBe(true);
      await reading;
    } finally {
      parent.abort();
      await reading;
      workflowMocks.cancellationRequested.mockResolvedValue(false);
      vi.useRealTimers();
    }
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

  it('does not serve a Work turn inline once the Work switch has said no', async () => {
    const refusal = workSwitchedOff();
    workflowMocks.assertCapabilityAvailable.mockRejectedValueOnce(refusal);

    await expect(runCloudAgentTurn(turnInput({ ...workInput() }))).rejects.toBe(refusal);

    expect(workflowMocks.start).not.toHaveBeenCalled();
    expect(workflowMocks.runToolLoop).not.toHaveBeenCalled();
    expect(workflowMocks.buildStream).not.toHaveBeenCalled();
  });

  it('refuses the same way for a caller that answers for durable failures itself', async () => {
    const refusal = workSwitchedOff();
    workflowMocks.assertCapabilityAvailable.mockRejectedValueOnce(refusal);

    await expect(
      runCloudAgentTurn(turnInput({ ...workInput(), onDurableUnavailable: 'fail' })),
    ).rejects.toBe(refusal);
    expect(workflowMocks.runToolLoop).not.toHaveBeenCalled();
  });

  it('still serves a Work turn inline when the switch could not be read', async () => {
    workflowMocks.assertCapabilityAvailable.mockRejectedValueOnce(new Error('flag store down'));

    const turn = await runCloudAgentTurn(turnInput({ ...workInput() }));

    expect(turn).toMatchObject({ transport: 'inline', degradedReason: 'workflow_start_failed' });
    expect(workflowMocks.runToolLoop).toHaveBeenCalledOnce();
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

  it('persists caller obligations and keeps the run awaiting input on disconnect', async () => {
    await runCloudAgentTurn(turnInput());
    const onCallerCheckpoint = toolLoopOptions()['onCallerToolCheckpoint'] as (
      checkpoint: unknown,
    ) => Promise<{ events: unknown[] }>;
    const events = [{ event: { type: 'caller-tools-requested' } }];
    const saved = await onCallerCheckpoint({
      sessionId: 'session-1',
      turnId: 'turn-1',
      nextEventSequence: 9,
      completedSteps: 2,
      messages: [{ role: 'assistant', content: '', tool_calls: [] }],
      pendingToolCalls: [{ id: 'local-1', qualifiedName: 'read_dom', args: {} }],
      events,
    });
    expect(saved).toEqual({ events });
    expect(workflowMocks.saveCaller).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        userId: 'user-1',
        runId: RUN_ID,
        nextEventSequence: 9,
        pendingToolCalls: [{ id: 'local-1', qualifiedName: 'read_dom', args: {} }],
        events,
      }),
    );
    expect((streamInput()['preserveAwaitingInputOnCancel'] as () => boolean)()).toBe(true);
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
