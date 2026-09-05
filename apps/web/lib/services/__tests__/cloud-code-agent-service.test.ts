import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/e2b/runtime', () => ({ getE2BExecutor: vi.fn(), killE2BSession: vi.fn() }));
vi.mock('@/lib/e2b/session-store', () => ({
  managedCloudCodeSessionScope: vi.fn(() => ({ scope: 'test' })),
  CHAT_SANDBOX_NETWORK_ACCESS: 'trusted',
  deleteE2BSession: vi.fn(),
  getE2BSession: vi.fn(),
  saveE2BSession: vi.fn(),
  withUserSandboxLock: vi.fn(async (_scope: unknown, critical: () => Promise<unknown>) => ({
    locked: true,
    result: await critical(),
  })),
}));
vi.mock('@/lib/services/provider-adapter-service', () => ({
  buildServerProviderAdapter: vi.fn(() => ({ stream: vi.fn() })),
  resolveProviderFromModel: vi.fn(() => 'anthropic'),
}));
vi.mock('@/lib/services/cloud-code-agent-runner', () => ({
  createCloudCodeToolRunner: vi.fn(() => ({})),
}));
// importOriginal, not a bare factory: the service also imports the loop's
// constants, and a factory that only supplies the function makes those undefined.
vi.mock('@/lib/services/cloud-code-agent-loop', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/cloud-code-agent-loop')>()),
  runCloudCodeAgentTurn: vi.fn(),
}));
vi.mock('@/lib/services/managed-usage-request-service', () => ({
  fingerprintManagedUsageRequest: vi.fn(() => 'request-hash'),
  reserveManagedUsageRequest: vi.fn(),
  reserveManagedUsageProviderStep: vi.fn(),
  finalizeManagedUsageRequest: vi.fn(),
}));
vi.mock('@/lib/services/cloud-code-session-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/cloud-code-session-service')>();
  return {
    ...actual,
    getCloudCodeSession: vi.fn(),
    claimCloudCodeSessionForRun: vi.fn(async () => ({ state: 'running' })),
    releaseCloudCodeSessionAfterRun: vi.fn(async () => ({ state: 'ready' })),
  };
});

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { SLOT_REGISTRY, listCanonicalModels } from '@agiworkforce/types';
import { getE2BExecutor } from '@/lib/e2b/runtime';
import { getCloudCodeSession } from '@/lib/services/cloud-code-session-service';
import { runCloudCodeAgentTurn } from '@/lib/services/cloud-code-agent-loop';
import {
  accumulateObservedProviderUsage,
  createObservedProviderUsage,
} from '@/lib/services/managed-usage-accounting-service';
import {
  finalizeManagedUsageRequest,
  reserveManagedUsageProviderStep,
  reserveManagedUsageRequest,
} from '@/lib/services/managed-usage-request-service';
import type {
  CloudCodeAgentStopReason,
  CloudCodeTurnUsage,
} from '@/lib/services/cloud-code-agent-loop';
import {
  CLOUD_CODE_AGENT_TURN_BUDGET_MS,
  executePersistedAgentTurn,
  startCloudCodeAgentTurn,
} from '@/lib/services/cloud-code-agent-service';

const FLAT_RESERVATION_CENTS = 25;

const FLAGSHIP_MODEL = SLOT_REGISTRY.flagship_coding.modelId;
const STANDARD_MODEL = SLOT_REGISTRY.coding_balanced.modelId;
const TIERED_MODEL = (() => {
  const candidate = listCanonicalModels().find(
    (model) => (model.inputTokenPricingTiers?.length ?? 0) > 0,
  );
  const firstTier = candidate?.inputTokenPricingTiers?.[0];
  if (!candidate || !firstTier) throw new Error('Expected a catalog tiered-pricing fixture');
  return { ...candidate, firstTier };
})();

const NO_USAGE: CloudCodeTurnUsage = createObservedProviderUsage();

function usage(partial: Partial<CloudCodeTurnUsage>): CloudCodeTurnUsage {
  return { ...NO_USAGE, ...partial };
}

function dbStub() {
  return { query: vi.fn(async () => [{ id: 'turn-1' }]) };
}

async function runTurn(options: {
  model?: string;
  turnUsage?: CloudCodeTurnUsage;
  stopReason?: 'done' | 'error' | 'max_steps';
  steps?: number;
}) {
  vi.mocked(runCloudCodeAgentTurn).mockImplementation(async (input) => {
    await input.onStepCommitted?.(0);
    return {
      stopReason: options.stopReason ?? 'done',
      stepsUsed: options.steps ?? 1,
      usage: options.turnUsage ?? NO_USAGE,
      finalMessage: 'done',
      messages: [],
    };
  });

  await startCloudCodeAgentTurn({
    db: dbStub() as never,
    owner: { userId: 'user-1', organizationId: null },
    sessionId: 'session-1',
    goal: 'Fix the failing test',
    model: options.model ?? STANDARD_MODEL,
    planTier: 'pro',
    idempotencyKey: '11111111-1111-4111-8111-111111111111',
    signal: new AbortController().signal,
  });
}

function settledCostCents(): number {
  const call = vi.mocked(finalizeManagedUsageRequest).mock.calls.at(-1);
  return call?.[0].actualCostCents ?? Number.NaN;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCloudCodeSession).mockResolvedValue({
    state: 'ready',
    repositoryUrl: null,
    networkAccess: 'none',
    workspacePath: '/workspace',
  } as never);
  vi.mocked(getE2BExecutor).mockResolvedValue({
    dispose: vi.fn(),
    pause: vi.fn(),
  } as never);
  vi.mocked(reserveManagedUsageRequest).mockResolvedValue({
    db: dbStub(),
    userId: 'user-1',
    idempotencyKey: '11111111-1111-4111-8111-111111111111',
    requestHash: 'request-hash',
    leaseToken: 'lease-1',
    estimatedCostCents: FLAT_RESERVATION_CENTS,
  } as never);
  vi.mocked(reserveManagedUsageProviderStep).mockResolvedValue({} as never);
  vi.mocked(finalizeManagedUsageRequest).mockResolvedValue({} as never);
});

describe('Cloud Code turn settlement uses measured tokens', () => {
  it('settles a cheap turn well below the flat reservation', async () => {
    await runTurn({ turnUsage: usage({ inputTokens: 200, outputTokens: 40 }) });
    const settled = settledCostCents();
    expect(settled).toBeGreaterThan(0);
    expect(settled).toBeLessThan(FLAT_RESERVATION_CENTS);
  });

  it('settles an expensive turn well above the flat reservation', async () => {
    await runTurn({
      turnUsage: usage({ inputTokens: 4_000_000, outputTokens: 400_000 }),
      steps: 20,
    });
    expect(settledCostCents()).toBeGreaterThan(FLAT_RESERVATION_CENTS * 10);
  });

  it('prices two different turns differently, rather than at one flat rate', async () => {
    await runTurn({ turnUsage: usage({ inputTokens: 10_000, outputTokens: 1_000 }) });
    const cheap = settledCostCents();
    await runTurn({ turnUsage: usage({ inputTokens: 900_000, outputTokens: 90_000 }) });
    expect(settledCostCents()).toBeGreaterThan(cheap);
  });

  it('keeps two subthreshold provider steps separate from one tiered request', async () => {
    const threshold = TIERED_MODEL.firstTier.thresholdTokens;
    const subthresholdTokens = Math.floor(threshold * 0.75);
    const twoCalls = createObservedProviderUsage();
    for (let call = 0; call < 2; call += 1) {
      accumulateObservedProviderUsage(
        twoCalls,
        { inputTokens: subthresholdTokens, outputTokens: 0 },
        { provider: TIERED_MODEL.provider, model: TIERED_MODEL.id },
      );
    }
    await runTurn({ model: TIERED_MODEL.id, turnUsage: twoCalls });
    const twoCallCost = settledCostCents();

    const oneLongCall = createObservedProviderUsage();
    accumulateObservedProviderUsage(
      oneLongCall,
      { inputTokens: subthresholdTokens * 2, outputTokens: 0 },
      { provider: TIERED_MODEL.provider, model: TIERED_MODEL.id },
    );
    await runTurn({ model: TIERED_MODEL.id, turnUsage: oneLongCall });

    expect(settledCostCents()).toBeGreaterThan(twoCallCost);
  });

  it('bills cache reads and writes the provider reported', async () => {
    await runTurn({ turnUsage: usage({ inputTokens: 1000, outputTokens: 100 }) });
    const withoutCache = settledCostCents();
    await runTurn({
      turnUsage: usage({
        inputTokens: 1000,
        outputTokens: 100,
        cacheReadTokens: 2_000_000,
        cacheWriteTokens: 2_000_000,
      }),
    });
    expect(settledCostCents()).toBeGreaterThan(withoutCache);
  });

  it('falls back to the reservation, not to zero, when the provider reported nothing', async () => {
    await runTurn({ turnUsage: NO_USAGE });
    expect(settledCostCents()).toBe(FLAT_RESERVATION_CENTS);
  });

  it('settles a failed turn at zero', async () => {
    await runTurn({
      stopReason: 'error',
      turnUsage: usage({ inputTokens: 900_000, outputTokens: 90_000 }),
    });
    expect(settledCostCents()).toBe(0);
  });
});

describe('Cloud Code flagship flag reflects the model actually called', () => {
  it('reserves a flagship model as flagship, so the weekly cap applies', async () => {
    await runTurn({ model: FLAGSHIP_MODEL });
    expect(vi.mocked(reserveManagedUsageRequest).mock.calls[0]?.[0].isFlagship).toBe(true);
  });

  it('carries the flagship flag onto every per-step lease extension', async () => {
    await runTurn({ model: FLAGSHIP_MODEL });
    expect(vi.mocked(reserveManagedUsageProviderStep).mock.calls[0]?.[0].isFlagship).toBe(true);
  });

  it('does not flag a standard model', async () => {
    await runTurn({ model: STANDARD_MODEL });
    expect(vi.mocked(reserveManagedUsageRequest).mock.calls[0]?.[0].isFlagship).toBe(false);
    expect(vi.mocked(reserveManagedUsageProviderStep).mock.calls[0]?.[0].isFlagship).toBe(false);
  });
});

type TrackedDb = { query: ReturnType<typeof vi.fn> };

const TURN_ROW = [{ id: 'turn-1' }];

/** A db stub whose calls survive the turn, so the terminal writes can be read back. */
function trackedDb(): TrackedDb {
  return {
    query: vi.fn(async (text: string) =>
      String(text).startsWith('insert into cloud_code_agent_turns') ? TURN_ROW : [],
    ),
  };
}

/** The one write that moves a turn off `running` on a non-error stop reason. */
function terminalTurnUpdate(db: TrackedDb): unknown[] | undefined {
  const call = db.query.mock.calls.find(([text]) => String(text).includes('set state = $2'));
  return call?.[1] as unknown[] | undefined;
}

function startTurn(db: TrackedDb, signal?: AbortSignal) {
  return startCloudCodeAgentTurn({
    db: db as never,
    owner: { userId: 'user-1', organizationId: null },
    sessionId: 'session-1',
    goal: 'Fix the failing test',
    model: STANDARD_MODEL,
    planTier: 'pro',
    idempotencyKey: '11111111-1111-4111-8111-111111111111',
    signal: signal ?? new AbortController().signal,
  });
}

async function runTurnOn(db: TrackedDb, stopReason: CloudCodeAgentStopReason) {
  vi.mocked(runCloudCodeAgentTurn).mockResolvedValue({
    stopReason,
    stepsUsed: 3,
    usage: NO_USAGE,
    finalMessage: '',
    messages: [],
  });
  return startTurn(db);
}

/** Works whether vitest was rooted at apps/web or at the monorepo root. */
function webAppRoot(): string {
  let dir = process.cwd();
  for (let depth = 0; depth < 6; depth += 1) {
    if (existsSync(join(dir, 'app/api/code/sessions'))) return dir;
    if (existsSync(join(dir, 'apps/web/app/api/code/sessions'))) return join(dir, 'apps/web');
    dir = dirname(dir);
  }
  throw new Error(`Could not locate the web app root from ${process.cwd()}`);
}

function routeMaxDurationSeconds(relativePath: string): number {
  const source = readFileSync(join(webAppRoot(), 'app/api/code/sessions', relativePath), 'utf8');
  const match = /export const maxDuration = (\d+)/.exec(source);
  if (!match?.[1]) throw new Error(`No maxDuration literal in ${relativePath}`);
  return Number(match[1]);
}

describe('Cloud Code turn state does not launder a turn that stopped short', () => {
  it('records a timed-out turn as failed, not completed', async () => {
    const db = trackedDb();
    await runTurnOn(db, 'timeout');
    const params = terminalTurnUpdate(db);
    expect(params?.[1]).toBe('failed');
    expect(params?.[3]).toBe('timeout');
  });

  it('records a step-capped turn as failed, not completed', async () => {
    const db = trackedDb();
    await runTurnOn(db, 'max_steps');
    const params = terminalTurnUpdate(db);
    expect(params?.[1]).toBe('failed');
    expect(params?.[3]).toBe('max_steps');
  });

  it('still records a finished turn as completed', async () => {
    const db = trackedDb();
    await runTurnOn(db, 'done');
    expect(terminalTurnUpdate(db)?.[1]).toBe('completed');
  });

  it('explains a timeout instead of persisting a failed turn with no words', async () => {
    const db = trackedDb();
    const record = await runTurnOn(db, 'timeout');
    expect(terminalTurnUpdate(db)?.[5]).toMatch(/time budget/i);
    expect(record.errorMessage).toMatch(/time budget/i);
  });
});

describe('Cloud Code loop budget fits inside the platform ceiling', () => {
  it('hands the loop a budget under the maxDuration both routes declare', () => {
    const agentRoute = routeMaxDurationSeconds('[sessionId]/agent/route.ts');
    const approvalsRoute = routeMaxDurationSeconds('[sessionId]/agent/approvals/route.ts');
    expect(approvalsRoute).toBe(agentRoute);
    // Strictly under, with room for the unwind: the loop's `timeout` guard is
    // dead code the moment the platform kill lands first.
    expect(CLOUD_CODE_AGENT_TURN_BUDGET_MS).toBeLessThan(agentRoute * 1000);
  });

  it('passes that budget to the loop rather than letting it default to 600s', async () => {
    await runTurnOn(trackedDb(), 'done');
    const passed = vi.mocked(runCloudCodeAgentTurn).mock.calls.at(-1)?.[0];
    expect(passed?.maxDurationMs).toBe(CLOUD_CODE_AGENT_TURN_BUDGET_MS);
  });
});

describe('Cloud Code turn releases its resources when it blows the budget', () => {
  it('pauses the sandbox, settles the reservation and closes the row on a budget abort', async () => {
    vi.useFakeTimers();
    try {
      const pause = vi.fn();
      const dispose = vi.fn();
      vi.mocked(getE2BExecutor).mockResolvedValue({ pause, dispose } as never);
      // A provider call that never returns: only the composed deadline signal
      // can end this turn.
      vi.mocked(runCloudCodeAgentTurn).mockImplementation(
        (loopInput) =>
          new Promise((_resolve, reject) => {
            loopInput.signal.addEventListener('abort', () => reject(loopInput.signal.reason), {
              once: true,
            });
          }),
      );

      const db = trackedDb();
      const pending = startTurn(db);
      await vi.advanceTimersByTimeAsync(CLOUD_CODE_AGENT_TURN_BUDGET_MS + 1);
      const record = await pending;

      expect(record.stopReason).toBe('timeout');
      expect(pause).toHaveBeenCalledTimes(1);
      expect(dispose).toHaveBeenCalledTimes(1);
      expect(vi.mocked(finalizeManagedUsageRequest)).toHaveBeenCalledTimes(1);
      const params = terminalTurnUpdate(db);
      expect(params?.[1]).toBe('failed');
      expect(params?.[3]).toBe('timeout');
    } finally {
      vi.useRealTimers();
    }
  });

  it('disposes the sandbox even when pausing it throws', async () => {
    const dispose = vi.fn();
    vi.mocked(getE2BExecutor).mockResolvedValue({
      pause: vi.fn(async () => {
        throw new Error('pause failed');
      }),
      dispose,
    } as never);

    await runTurnOn(trackedDb(), 'done');
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('settles the reservation even when the terminal turn row cannot be written', async () => {
    const db: TrackedDb = {
      query: vi.fn(async (text: string) => {
        if (String(text).includes('set state = $2')) throw new Error('row write failed');
        return String(text).startsWith('insert into cloud_code_agent_turns') ? TURN_ROW : [];
      }),
    };
    vi.mocked(runCloudCodeAgentTurn).mockResolvedValue({
      stopReason: 'done',
      stepsUsed: 2,
      usage: NO_USAGE,
      finalMessage: 'done',
      messages: [],
    });

    await expect(startTurn(db)).rejects.toThrow(/could not be recorded/i);
    expect(vi.mocked(finalizeManagedUsageRequest)).toHaveBeenCalledTimes(1);
  });

  it('does not mislabel a real client cancellation as a timeout', async () => {
    const aborted = new AbortController();
    aborted.abort();
    const db = trackedDb();
    vi.mocked(runCloudCodeAgentTurn).mockResolvedValue({
      stopReason: 'cancelled',
      stepsUsed: 1,
      usage: NO_USAGE,
      finalMessage: '',
      messages: [],
    });

    await startTurn(db, aborted.signal);
    const params = terminalTurnUpdate(db);
    expect(params?.[1]).toBe('cancelled');
    expect(params?.[3]).toBe('cancelled');
  });
});

describe('Cloud Code runs the harness the session was created with', () => {
  const CLAUDE_RESULT_LINE = `${JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    num_turns: 2,
    result: 'Patched the guard.',
    session_id: 'harness-session-1',
    total_cost_usd: 0.31,
  })}\n`;

  function harnessExecutor(stdout: string) {
    const runCommand = vi.fn(async (_input: { command: string; cwd?: string }) => ({
      ok: true,
      output: '',
      stdout,
      stderr: '',
      exitCode: 0,
    }));
    vi.mocked(getE2BExecutor).mockResolvedValue({
      runCommand,
      writeFile: vi.fn(async () => ({ ok: true, output: '' })),
      createFolder: vi.fn(async () => ({ ok: true, output: '' })),
      readFileBytes: vi.fn(async () => null),
      pause: vi.fn(),
      dispose: vi.fn(),
    } as never);
    return runCommand;
  }

  function sessionOn(runtimeId: string | null) {
    vi.mocked(getCloudCodeSession).mockResolvedValue({
      state: 'ready',
      repositoryUrl: null,
      networkAccess: 'none',
      workspacePath: '/home/user/project',
      runtimeId,
    } as never);
  }

  it('invokes the harness CLI instead of the generic tool loop', async () => {
    sessionOn('claude');
    const runCommand = harnessExecutor(CLAUDE_RESULT_LINE);

    const record = await startTurn(trackedDb());

    expect(String(runCommand.mock.calls[0]?.[0]?.command)).toContain(
      'claude --dangerously-skip-permissions --output-format stream-json',
    );
    expect(vi.mocked(runCloudCodeAgentTurn)).not.toHaveBeenCalled();
    expect(record.stopReason).toBe('done');
    expect(record.finalMessage).toBe('Patched the guard.');
  });

  it('settles a harness turn at the cost the harness reported', async () => {
    sessionOn('claude');
    harnessExecutor(CLAUDE_RESULT_LINE);

    await startTurn(trackedDb());

    expect(settledCostCents()).toBe(31);
  });

  it('falls back to the generic loop when the runtime carries no harness binary', async () => {
    sessionOn('code-interpreter-v1');
    harnessExecutor(CLAUDE_RESULT_LINE);
    vi.mocked(runCloudCodeAgentTurn).mockResolvedValue({
      stopReason: 'done',
      stepsUsed: 1,
      usage: NO_USAGE,
      finalMessage: 'generic loop',
      messages: [],
    });

    const record = await startTurn(trackedDb());

    expect(vi.mocked(runCloudCodeAgentTurn)).toHaveBeenCalledTimes(1);
    expect(record.finalMessage).toBe('generic loop');
  });
  it('leaves an approval resume on the loop that asked for it', async () => {
    sessionOn('claude');
    const runCommand = harnessExecutor(CLAUDE_RESULT_LINE);
    vi.mocked(runCloudCodeAgentTurn).mockResolvedValue({
      stopReason: 'done',
      stepsUsed: 1,
      usage: NO_USAGE,
      finalMessage: 'ran the approved command',
      messages: [],
    });

    await executePersistedAgentTurn({
      db: trackedDb() as never,
      owner: { userId: 'user-1', organizationId: null },
      session: {
        state: 'ready',
        repositoryUrl: null,
        networkAccess: 'none',
        workspacePath: '/home/user/project',
        runtimeId: 'claude',
      } as never,
      sessionId: 'session-1',
      turnId: 'turn-1',
      goal: 'Fix the failing test',
      model: STANDARD_MODEL,
      provider: 'anthropic',
      planTier: 'pro',
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
      signal: new AbortController().signal,
      preApproved: { toolUseId: 'call-1', command: 'rm build.log', approved: true },
    });

    expect(vi.mocked(runCloudCodeAgentTurn)).toHaveBeenCalledTimes(1);
    expect(runCommand).not.toHaveBeenCalled();
  });
});
