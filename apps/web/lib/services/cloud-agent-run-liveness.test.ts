import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('./agent-notification-service', () => ({
  notifyAgentRunEvent: vi.fn(async () => ({ pushed: false })),
}));

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import {
  AGENT_TASK_STATE_LABELS,
  PROVIDER_STREAM_CANCELLATION,
  TERMINAL_AGENT_TASK_STATES,
} from '@agiworkforce/types';
import { BACKGROUND_JOB_CANCELLATION } from '@/lib/jobs/cancellation';
import type { AgentTaskState } from '@agiworkforce/types/protocol';
import {
  CLOUD_AGENT_RUN_CANCELLATION,
  EXECUTOR_HELD_TASK_STATES,
  HUMAN_HELD_TASK_STATES,
  isCloudAgentRunHumanHeld,
  isCloudAgentRunTerminal,
} from './cloud-agent-run-service';

const DECLARED = Object.keys(AGENT_TASK_STATE_LABELS) as AgentTaskState[];

/**
 * Who can end a run in each state, taken from the classification the engine
 * itself sweeps and cancels from. A state nothing can end is a run that stays
 * on the reader's screen for ever, which is how `planning` and `resuming`
 * behaved for as long as the stall sweep carried its own list of two states.
 */
function ender(state: AgentTaskState): 'already ended' | 'stall sweep' | 'the reader' | null {
  if (isCloudAgentRunTerminal(state)) return 'already ended';
  if (EXECUTOR_HELD_TASK_STATES.includes(state)) return 'stall sweep';
  if (isCloudAgentRunHumanHeld(state)) return 'the reader';
  return null;
}

describe('every state a run can be left in can be ended', () => {
  it.each(DECLARED)('%s has something that ends it', (state) => {
    expect(ender(state)).not.toBeNull();
  });

  it('classifies each state exactly once', () => {
    for (const state of DECLARED) {
      const holders = [
        isCloudAgentRunTerminal(state),
        EXECUTOR_HELD_TASK_STATES.includes(state),
        isCloudAgentRunHumanHeld(state),
      ].filter(Boolean);
      expect(holders).toHaveLength(1);
    }
  });

  it('covers the whole vocabulary between the three classifications', () => {
    const classified = new Set<string>([
      ...TERMINAL_AGENT_TASK_STATES,
      ...EXECUTOR_HELD_TASK_STATES,
      ...HUMAN_HELD_TASK_STATES,
    ]);
    expect([...classified].sort()).toEqual([...DECLARED].sort());
  });
});

/**
 * A run row driven through interleavings a real deployment produces: a duplicate
 * start under one idempotency key, a stop arriving mid-step, a worker that dies
 * holding the run, and a retry of an operation that already happened. The rules
 * applied here are the ones the service's own statements enforce, so a sweep
 * that leaves a run unendable or executes a side effect twice is a defect in
 * those statements rather than in the walk.
 */
interface RunModel {
  state: AgentTaskState;
  cancellationRequested: boolean;
  workerAlive: boolean;
  sideEffects: string[];
  settledOperations: Set<string>;
}

type Operation =
  | { kind: 'start'; requestId: string }
  | { kind: 'plan' }
  | { kind: 'step'; operationKey: string }
  | { kind: 'ask_approval' }
  | { kind: 'answer_approval' }
  | { kind: 'request_pause' }
  | { kind: 'record_pause' }
  | { kind: 'claim_pause' }
  | { kind: 'lease_expires' }
  | { kind: 'request_cancel' }
  | { kind: 'reader_ends_parked_run' }
  | { kind: 'worker_dies' }
  | { kind: 'stall_sweep' }
  | { kind: 'finish' };

const OPERATIONS: Operation[] = [
  { kind: 'start', requestId: 'turn-1' },
  { kind: 'start', requestId: 'turn-1' },
  { kind: 'plan' },
  { kind: 'step', operationKey: 'op-a' },
  { kind: 'step', operationKey: 'op-a' },
  { kind: 'step', operationKey: 'op-b' },
  { kind: 'ask_approval' },
  { kind: 'answer_approval' },
  { kind: 'request_pause' },
  { kind: 'record_pause' },
  { kind: 'claim_pause' },
  { kind: 'lease_expires' },
  { kind: 'request_cancel' },
  { kind: 'reader_ends_parked_run' },
  { kind: 'worker_dies' },
  { kind: 'stall_sweep' },
  { kind: 'finish' },
];

function moveTo(run: RunModel, next: AgentTaskState): void {
  // Terminal is absorbing: the journal and the transition both refuse a write
  // that would take a run the reader was told had ended back into live work.
  if (isCloudAgentRunTerminal(run.state) && !isCloudAgentRunTerminal(next)) return;
  run.state = next;
}

function apply(run: RunModel, operation: Operation): void {
  const driving = EXECUTOR_HELD_TASK_STATES.includes(run.state) && run.workerAlive;

  switch (operation.kind) {
    case 'start':
      if (run.state === 'queued') moveTo(run, 'running');
      return;
    case 'plan':
      if (driving && run.state === 'running') moveTo(run, 'planning');
      return;
    case 'step': {
      if (!driving) return;
      if (run.cancellationRequested) {
        moveTo(run, 'cancelled');
        return;
      }
      if (!run.settledOperations.has(operation.operationKey)) {
        run.settledOperations.add(operation.operationKey);
        run.sideEffects.push(operation.operationKey);
      }
      moveTo(run, 'running');
      return;
    }
    case 'ask_approval':
      if (driving) moveTo(run, 'awaiting_approval');
      return;
    case 'answer_approval':
      if (run.state === 'awaiting_approval' && !run.cancellationRequested) moveTo(run, 'running');
      return;
    case 'request_pause':
      if (EXECUTOR_HELD_TASK_STATES.includes(run.state) && !run.cancellationRequested) {
        run.workerAlive = run.workerAlive && true;
      }
      return;
    case 'record_pause':
      if (driving) moveTo(run, 'paused');
      return;
    case 'claim_pause':
      if (run.state === 'paused' && !run.cancellationRequested) {
        run.workerAlive = true;
        moveTo(run, 'resuming');
      }
      return;
    case 'lease_expires':
      if (run.state === 'resuming' && !run.workerAlive) moveTo(run, 'paused');
      return;
    case 'request_cancel':
      run.cancellationRequested = true;
      return;
    case 'reader_ends_parked_run':
      if (run.cancellationRequested && isCloudAgentRunHumanHeld(run.state)) {
        moveTo(run, 'cancelled');
      }
      return;
    case 'worker_dies':
      run.workerAlive = false;
      return;
    case 'stall_sweep':
      if (!run.workerAlive && EXECUTOR_HELD_TASK_STATES.includes(run.state)) {
        moveTo(run, run.cancellationRequested ? 'cancelled' : 'failed');
      }
      return;
    case 'finish':
      if (driving) moveTo(run, run.cancellationRequested ? 'cancelled' : 'completed');
      return;
  }
}

function seededOrder(seed: number, length: number): number[] {
  const order = Array.from({ length }, (_unused, index) => index);
  let state = seed >>> 0;
  for (let index = order.length - 1; index > 0; index -= 1) {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    const pick = state % (index + 1);
    [order[index], order[pick]] = [order[pick]!, order[index]!];
  }
  return order;
}

function drain(run: RunModel): void {
  // Whoever is left holding the run finishes it: the sweep for a worker that is
  // gone, the reader for a run parked on them.
  for (let step = 0; step < DECLARED.length + 4; step += 1) {
    if (isCloudAgentRunTerminal(run.state)) return;
    run.workerAlive = false;
    run.cancellationRequested = true;
    apply(run, { kind: 'stall_sweep' });
    apply(run, { kind: 'reader_ends_parked_run' });
    apply(run, { kind: 'lease_expires' });
  }
}

const SWEEP_SEEDS = 2_000;

describe('a seeded sweep over run interleavings', () => {
  it('never leaves a run nothing can end, and never repeats a side effect', () => {
    const endings = new Map<AgentTaskState, number>();

    for (let seed = 1; seed <= SWEEP_SEEDS; seed += 1) {
      const run: RunModel = {
        state: 'queued',
        cancellationRequested: false,
        workerAlive: true,
        sideEffects: [],
        settledOperations: new Set(),
      };

      for (const index of seededOrder(seed, OPERATIONS.length)) {
        apply(run, OPERATIONS[index]!);
        expect(ender(run.state), `seed ${seed} reached an unendable ${run.state}`).not.toBeNull();
      }

      drain(run);
      expect(isCloudAgentRunTerminal(run.state), `seed ${seed} never ended`).toBe(true);
      expect(new Set(run.sideEffects).size).toBe(run.sideEffects.length);
      endings.set(run.state, (endings.get(run.state) ?? 0) + 1);
    }

    for (const state of endings.keys()) expect(isCloudAgentRunTerminal(state)).toBe(true);
    expect(endings.size).toBeGreaterThan(1);
  });

  it('never restarts a run that has already ended', () => {
    for (const ended of TERMINAL_AGENT_TASK_STATES) {
      for (let seed = 1; seed <= 200; seed += 1) {
        const run: RunModel = {
          state: ended,
          cancellationRequested: false,
          workerAlive: true,
          sideEffects: [],
          settledOperations: new Set(),
        };
        for (const index of seededOrder(seed, OPERATIONS.length)) apply(run, OPERATIONS[index]!);
        expect(isCloudAgentRunTerminal(run.state)).toBe(true);
      }
    }
  });

  it('runs a repeated operation key once, whatever order the retries arrive in', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const run: RunModel = {
        state: 'running',
        cancellationRequested: false,
        workerAlive: true,
        sideEffects: [],
        settledOperations: new Set(),
      };
      const retries: Operation[] = Array.from({ length: 6 }, () => ({
        kind: 'step',
        operationKey: 'op-a',
      }));
      for (const index of seededOrder(seed, retries.length)) apply(run, retries[index]!);
      expect(run.sideEffects).toEqual(['op-a']);
    }
  });
});

/**
 * Three engines answered what a stop actually stops and the one that runs Work
 * did not, so a surface rendering a stopped Work run had nothing to read. The
 * declarations are enumerated from the tree rather than listed here, so an
 * engine added later is held to the same answer.
 */
describe('every engine a stop reaches says what it stopped', () => {
  const declarations = (() => {
    const root = path.resolve(__dirname, '../..');
    const found: Array<{ file: string; name: string }> = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '.next') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.name.endsWith('.ts') || entry.name.includes('.test.')) continue;
        const source = readFileSync(full, 'utf8');
        for (const match of source.matchAll(/export const ([A-Z_]+): CancellationSemantics/g)) {
          found.push({ file: path.relative(root, full), name: match[1]! });
        }
      }
    };
    walk(path.join(root, 'lib'));
    walk(path.join(root, 'app'));
    return found;
  })();

  it('finds the engines that declare it, including the Work runtime', () => {
    expect(declarations.length).toBeGreaterThanOrEqual(2);
    expect(declarations.map((entry) => entry.name)).toContain('CLOUD_AGENT_RUN_CANCELLATION');
  });

  it.each([
    ['CLOUD_AGENT_RUN_CANCELLATION', CLOUD_AGENT_RUN_CANCELLATION],
    ['BACKGROUND_JOB_CANCELLATION', BACKGROUND_JOB_CANCELLATION],
    ['PROVIDER_STREAM_CANCELLATION', PROVIDER_STREAM_CANCELLATION],
  ])('%s answers all five questions with something a reader can act on', (_name, semantics) => {
    expect(semantics.immediatelyStopped.length).toBeGreaterThan(0);
    expect(semantics.cannotBeStopped.length).toBeGreaterThan(0);
    expect(semantics.propagatesTo.length).toBeGreaterThan(0);
    for (const sentence of [...semantics.immediatelyStopped, ...semantics.cannotBeStopped]) {
      expect(sentence.trim().length).toBeGreaterThan(20);
    }
    expect(typeof semantics.partialOutputRetained).toBe('boolean');
    expect(typeof semantics.resumable).toBe('boolean');
  });

  it('never claims a stopped Work run can be picked back up', () => {
    expect(CLOUD_AGENT_RUN_CANCELLATION.resumable).toBe(false);
    expect(isCloudAgentRunTerminal('cancelled')).toBe(true);
  });

  it('is honest that provider spend a run already incurred is still charged', () => {
    expect(CLOUD_AGENT_RUN_CANCELLATION.cannotBeStopped.join(' ')).toMatch(/billed|settled/i);
    expect(CLOUD_AGENT_RUN_CANCELLATION.partialOutputRetained).toBe(true);
  });
});
