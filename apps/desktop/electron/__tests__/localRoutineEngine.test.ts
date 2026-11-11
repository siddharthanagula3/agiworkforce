import { describe, expect, it, vi } from 'vitest';
import type {
  LocalRoutine,
  LocalRoutineInput,
  DeveloperSessionEvent,
} from '@agiworkforce/local-runtime-contract';
import {
  LocalRoutineCapacityError,
  LocalRoutineEngine,
  type LocalRoutineDependencies,
} from '../runtime/localRoutineEngine';

function fixture() {
  let now = new Date('2026-10-16T09:00:00Z');
  let authority: { rootIdentity: string; grantRevision: string } | null = {
    rootIdentity: 'root:1:2',
    grantRevision: 'grant:1',
  };
  const saved: LocalRoutine[][] = [];
  const release = vi.fn();
  const dependencies: LocalRoutineDependencies = {
    deviceId: 'device',
    now: () => now,
    save: vi.fn((routines) => {
      saved.push(structuredClone([...routines]));
    }),
    authority: () => authority,
    createSession: vi.fn(async () => 'thread'),
    start: vi.fn(async (_root, _thread, _model, _prompt, allowed) => {
      if (!allowed()) throw new Error('revoked');
      return 'turn';
    }),
    cancel: vi.fn(async () => undefined),
    keepAwake: vi.fn(() => release),
  };
  const input: LocalRoutineInput = {
    name: 'Owned routine',
    rootId: 'root',
    prompt: 'Inspect this project',
    model: 'selected-fixture-model',
    schedule: { type: 'interval', intervalMs: 60_000, timezone: 'America/Chicago', enabled: true },
    missedExecutionPolicy: 'run_once',
    keepAwake: true,
    notificationSettings: {
      onSuccess: true,
      onFailure: true,
      onApproval: true,
      push: true,
      email: false,
    },
  };
  const engine = new LocalRoutineEngine(dependencies);
  return {
    engine,
    dependencies,
    saved,
    release,
    input,
    advance: (milliseconds: number) => {
      now = new Date(now.getTime() + milliseconds);
    },
    revoke: () => {
      authority = null;
    },
    replaceGrant: () => {
      authority = { rootIdentity: 'root:1:2', grantRevision: 'grant:2' };
    },
  };
}
function finished(
  outcome: 'completed' | 'failed' | 'interrupted' = 'completed',
): DeveloperSessionEvent {
  return {
    type: 'turn-finished',
    threadId: 'thread',
    turnId: 'turn',
    outcome,
    response: '',
    failure: null,
    inputTokens: 0,
    outputTokens: 0,
  };
}
async function launched(f: ReturnType<typeof fixture>) {
  await f.engine.tick();
  await vi.waitFor(() => expect(f.dependencies.start).toHaveBeenCalledOnce());
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('device-owned local routine lifecycle', () => {
  it('persists a unique claim before any launch, deduplicates sweeps and releases awake state', async () => {
    const f = fixture();
    f.engine.create(f.input);
    f.advance(60_000);
    f.dependencies.createSession = vi.fn(async () => {
      expect(f.saved.at(-1)![0]!.runs[0]!.state).toBe('starting');
      return 'thread';
    });
    await launched(f);
    await f.engine.tick();
    expect(f.dependencies.start).toHaveBeenCalledOnce();
    expect(f.dependencies.keepAwake).toHaveBeenCalledOnce();
    f.engine.note('root', finished());
    f.engine.note('root', finished());
    expect(f.release).toHaveBeenCalledOnce();
    expect(f.engine.state().routines[0]!.runs[0]!.state).toBe('completed');
  });

  it('retains an interrupted claim after restart and never replays it', async () => {
    const f = fixture();
    f.engine.create(f.input);
    f.advance(60_000);
    await launched(f);
    const restored = new LocalRoutineEngine(f.dependencies, f.saved.at(-1)!);
    await restored.tick();
    expect(f.dependencies.start).toHaveBeenCalledOnce();
    expect(restored.state().routines[0]).toMatchObject({
      schedule: { enabled: false },
      runs: [{ state: 'interrupted', threadId: 'thread' }],
    });
  });

  it.each(['revoke', 'replaceGrant'] as const)(
    'cancels an owned run when its authority changes: %s',
    async (change) => {
      const f = fixture();
      f.engine.create(f.input);
      f.advance(60_000);
      await launched(f);
      f[change]();
      await f.engine.tick();
      expect(f.dependencies.cancel).toHaveBeenCalledWith('root', 'thread', 'turn');
      expect(f.release).toHaveBeenCalledOnce();
      expect(f.engine.state().routines[0]!.schedule.enabled).toBe(false);
    },
  );

  it('also cancels a claimed one-shot after revocation', async () => {
    const f = fixture();
    f.engine.create({
      ...f.input,
      schedule: { type: 'once', executeAt: '2026-10-16T09:01:00Z', enabled: true },
    });
    f.advance(60_000);
    await launched(f);
    f.revoke();
    await f.engine.tick();
    expect(f.dependencies.cancel).toHaveBeenCalledOnce();
  });

  it('does not start a model turn if authority changes during session creation', async () => {
    const f = fixture();
    f.dependencies.createSession = vi.fn(async () => {
      f.revoke();
      return 'thread';
    });
    f.engine.create(f.input);
    f.advance(60_000);
    await f.engine.tick();
    await vi.waitFor(() => expect(f.engine.state().routines[0]!.runs[0]!.state).toBe('failed'));
    expect(f.dependencies.start).not.toHaveBeenCalled();
    expect(f.dependencies.keepAwake).not.toHaveBeenCalled();
  });

  it('retains ownership when cancellation is not acknowledged', async () => {
    const f = fixture();
    const routine = f.engine.create(f.input);
    f.advance(60_000);
    await launched(f);
    f.dependencies.cancel = vi.fn(async () => {
      throw new Error('transport stopped');
    });
    await expect(f.engine.remove(routine.id)).rejects.toThrow(/ownership record was retained/);
    expect(f.engine.state().routines).toHaveLength(1);
    expect(f.engine.state().routines[0]!.pausedReason).toMatch(/not acknowledged/);
  });

  it('retains a paused pending start until its exact returned turn acknowledges cancellation', async () => {
    const f = fixture();
    const start = deferred<string>();
    const cancel = deferred<void>();
    f.dependencies.start = vi.fn(() => start.promise);
    f.dependencies.cancel = vi.fn(() => cancel.promise);
    const routine = f.engine.create(f.input);
    f.advance(60_000);
    await launched(f);

    await f.engine.setEnabled(routine.id, false);
    await f.engine.setEnabled(routine.id, false);
    await expect(f.engine.setEnabled(routine.id, true)).rejects.toThrow(/not been acknowledged/);
    expect(vi.mocked(f.dependencies.start).mock.calls[0]![4]()).toBe(false);
    expect(f.engine.state().routines[0]).toMatchObject({
      schedule: { enabled: false },
      runs: [{ state: 'starting' }],
    });
    expect(f.engine.state().routines[0]!.runs[0]!.finishedAt).toBeUndefined();
    expect(f.release).toHaveBeenCalledOnce();

    f.engine.note('root', { ...finished(), turnId: 'another-actor-turn' });
    expect(f.engine.state().routines[0]!.runs[0]!.turnId).toBeUndefined();
    expect(f.dependencies.cancel).not.toHaveBeenCalled();
    start.resolve('turn');
    await vi.waitFor(() =>
      expect(f.dependencies.cancel).toHaveBeenCalledWith('root', 'thread', 'turn'),
    );
    expect(f.engine.state().routines[0]!.runs[0]!.finishedAt).toBeUndefined();
    cancel.resolve();
    await vi.waitFor(() => expect(f.engine.state().routines[0]!.runs[0]!.state).toBe('cancelled'));
    expect(f.dependencies.cancel).toHaveBeenCalledOnce();
    expect(f.engine.state().routines[0]!.pausedReason).toBeNull();
  });

  it('refuses removal before the returned turn is known and after its cancellation fails', async () => {
    const f = fixture();
    const start = deferred<string>();
    f.dependencies.start = vi.fn(() => start.promise);
    f.dependencies.cancel = vi.fn(async () => {
      throw new Error('interrupt timed out');
    });
    const routine = f.engine.create(f.input);
    f.advance(60_000);
    await launched(f);

    await expect(f.engine.remove(routine.id)).rejects.toThrow(/ownership record was retained/);
    expect(f.engine.state().routines).toHaveLength(1);
    expect(f.dependencies.cancel).not.toHaveBeenCalled();
    start.resolve('turn');
    await vi.waitFor(() =>
      expect(f.engine.state().routines[0]!.pausedReason).toMatch(/not acknowledged/),
    );
    await expect(f.engine.remove(routine.id)).rejects.toThrow(/ownership record was retained/);
    await f.engine.setEnabled(routine.id, false);
    expect(f.dependencies.cancel).toHaveBeenCalledOnce();
    expect(f.engine.state().routines[0]!.runs[0]!.finishedAt).toBeUndefined();

    f.engine.note('root', finished());
    expect(f.engine.state().routines[0]!.runs[0]!.state).toBe('completed');
    await f.engine.remove(routine.id);
    expect(f.engine.state().routines).toHaveLength(0);
  });

  it('keeps a suspended pending generation stopped after wake without replaying it', async () => {
    const f = fixture();
    const start = deferred<string>();
    f.dependencies.start = vi.fn(() => start.promise);
    f.engine.create(f.input);
    f.advance(60_000);
    await launched(f);
    await f.engine.suspend();
    f.engine.resume();
    f.advance(60_000);
    await f.engine.tick();
    expect(vi.mocked(f.dependencies.start).mock.calls[0]![4]()).toBe(false);
    expect(f.dependencies.start).toHaveBeenCalledOnce();
    expect(f.engine.state().routines[0]!.runs[0]!.state).toBe('starting');

    start.resolve('turn');
    await vi.waitFor(() =>
      expect(f.engine.state().routines[0]!.runs[0]!.state).toBe('interrupted'),
    );
    expect(f.dependencies.cancel).toHaveBeenCalledWith('root', 'thread', 'turn');
    expect(f.engine.state().routines[0]!.schedule.enabled).toBe(true);
    expect(f.release).toHaveBeenCalledOnce();
  });

  it('does not infer turn ownership from events after an unacknowledged start', async () => {
    const f = fixture();
    const start = deferred<string>();
    f.dependencies.start = vi.fn(() => start.promise);
    const routine = f.engine.create(f.input);
    f.advance(60_000);
    await launched(f);
    start.reject(new Error('turn/start timed out'));
    await vi.waitFor(() =>
      expect(f.engine.state().routines[0]!.pausedReason).toMatch(/effects are unknown/),
    );
    await expect(f.engine.setEnabled(routine.id, true)).rejects.toThrow(/outcome is unknown/);
    f.engine.note('root', { type: 'turn-started', threadId: 'thread', turnId: 'turn' });
    f.engine.note('root', finished());
    await expect(f.engine.remove(routine.id)).rejects.toThrow(/ownership record was retained/);
    expect(f.dependencies.cancel).not.toHaveBeenCalled();
    expect(f.engine.state().routines[0]).toMatchObject({
      schedule: { enabled: false },
      runs: [{ state: 'starting' }],
    });
    expect(f.engine.state().routines[0]!.runs[0]!.turnId).toBeUndefined();
    expect(f.engine.state().routines[0]!.runs[0]!.finishedAt).toBeUndefined();
  });

  it('applies a buffered terminal event only after the returned turn matches it', async () => {
    const f = fixture();
    const start = deferred<string>();
    f.dependencies.start = vi.fn(() => start.promise);
    const routine = f.engine.create(f.input);
    f.advance(60_000);
    await launched(f);
    await f.engine.setEnabled(routine.id, false);
    expect(f.engine.note('root', finished())).toEqual({ notify: false });
    expect(f.engine.state().routines[0]!.runs[0]!.state).toBe('starting');
    start.resolve('turn');
    await vi.waitFor(() => expect(f.engine.state().routines[0]!.runs[0]!.state).toBe('completed'));
    expect(f.dependencies.cancel).not.toHaveBeenCalled();
    expect(f.engine.state().routines[0]!.pausedReason).toBeNull();
  });

  it('delivers a failure notice deferred before startup acknowledgment once the turn matches', async () => {
    const f = fixture();
    const deliverNotice = vi.fn();
    f.dependencies.deliverNotice = deliverNotice;
    const start = deferred<string>();
    f.dependencies.start = vi.fn(() => start.promise);
    f.engine.create(f.input);
    f.advance(60_000);
    await launched(f);
    const failure = finished('failed');
    expect(f.engine.note('root', failure)).toEqual({ notify: false });
    expect(deliverNotice).not.toHaveBeenCalled();
    start.resolve('turn');
    await vi.waitFor(() => expect(f.engine.state().routines[0]!.runs[0]!.state).toBe('failed'));
    expect(deliverNotice).toHaveBeenCalledOnce();
    expect(deliverNotice).toHaveBeenCalledWith('root', failure);
  });

  it('delivers no deferred notice for an event of another turn or an opted-out outcome', async () => {
    const f = fixture();
    const deliverNotice = vi.fn();
    f.dependencies.deliverNotice = deliverNotice;
    const start = deferred<string>();
    f.dependencies.start = vi.fn(() => start.promise);
    f.engine.create({
      ...f.input,
      notificationSettings: { ...f.input.notificationSettings, onSuccess: false },
    });
    f.advance(60_000);
    await launched(f);
    f.engine.note('root', { ...finished('failed'), turnId: 'other-turn' });
    f.engine.note('root', finished());
    start.resolve('turn');
    await vi.waitFor(() => expect(f.engine.state().routines[0]!.runs[0]!.state).toBe('completed'));
    expect(deliverNotice).not.toHaveBeenCalled();
  });

  it('delivers a deferred approval notice only while that approval is still unanswered', async () => {
    const f = fixture();
    const deliverNotice = vi.fn();
    f.dependencies.deliverNotice = deliverNotice;
    const start = deferred<string>();
    f.dependencies.start = vi.fn(() => start.promise);
    f.engine.create(f.input);
    f.advance(60_000);
    await launched(f);
    const requested = (requestId: string): DeveloperSessionEvent => ({
      type: 'approval-requested',
      threadId: 'thread',
      turnId: 'turn',
      requestId,
      kind: 'exec',
      summary: 'Tests',
      detail: '',
      command: 'cargo test',
      riskLevel: null,
      reversible: null,
      proposedCommandPrefix: null,
    });
    const open = requested('open');
    f.engine.note('root', requested('answered'));
    f.engine.note('root', open);
    f.engine.note('root', {
      type: 'approval-answered',
      threadId: 'thread',
      turnId: 'turn',
      requestId: 'answered',
      decision: 'deny',
      approved: false,
    });
    start.resolve('turn');
    await vi.waitFor(() =>
      expect(f.engine.state().routines[0]!.runs[0]!.state).toBe('awaiting_input'),
    );
    expect(deliverNotice).toHaveBeenCalledOnce();
    expect(deliverNotice).toHaveBeenCalledWith('root', open);
  });

  it('restores buffered input state without reacquiring awake state for a stop request', async () => {
    const f = fixture();
    const start = deferred<string>();
    f.dependencies.start = vi.fn(() => start.promise);
    const routine = f.engine.create(f.input);
    f.advance(60_000);
    await launched(f);
    await f.engine.setEnabled(routine.id, false);
    f.engine.note('root', {
      type: 'user-input-requested',
      threadId: 'thread',
      turnId: 'turn',
      requestId: 'input',
      question: 'Continue?',
    });
    f.engine.note('root', {
      type: 'user-input-answered',
      threadId: 'thread',
      turnId: 'turn',
      requestId: 'input',
      cancelled: true,
    });
    start.resolve('turn');
    await vi.waitFor(() => expect(f.engine.state().routines[0]!.runs[0]!.state).toBe('cancelled'));
    expect(f.dependencies.keepAwake).toHaveBeenCalledOnce();
    expect(f.release).toHaveBeenCalledOnce();
  });

  it('preserves a matching unanswered input received before startup acknowledgment', async () => {
    const f = fixture();
    const start = deferred<string>();
    f.dependencies.start = vi.fn(() => start.promise);
    f.engine.create(f.input);
    f.advance(60_000);
    await launched(f);
    f.engine.note('root', {
      type: 'user-input-requested',
      threadId: 'thread',
      turnId: 'turn',
      requestId: 'input',
      question: 'Continue?',
    });
    start.resolve('turn');
    await vi.waitFor(() =>
      expect(f.engine.state().routines[0]!.runs[0]!.state).toBe('awaiting_input'),
    );
    expect(f.release).toHaveBeenCalledOnce();
    expect(f.dependencies.cancel).not.toHaveBeenCalled();
  });

  it('can cancel before session creation completes without dispatching a model turn', async () => {
    const f = fixture();
    const session = deferred<string>();
    f.dependencies.createSession = vi.fn(() => session.promise);
    const routine = f.engine.create(f.input);
    f.advance(60_000);
    await f.engine.tick();
    await f.engine.setEnabled(routine.id, false);
    session.resolve('thread');
    await vi.waitFor(() => expect(f.engine.state().routines[0]!.runs[0]!.threadId).toBe('thread'));
    expect(f.engine.state().routines[0]!.runs[0]!.state).toBe('cancelled');
    expect(f.dependencies.start).not.toHaveBeenCalled();
    expect(f.dependencies.cancel).not.toHaveBeenCalled();
  });

  it('cancels a late returned turn after persistence failure stops the engine', async () => {
    const f = fixture();
    const start = deferred<string>();
    f.dependencies.start = vi.fn(() => start.promise);
    const routine = f.engine.create(f.input);
    f.advance(60_000);
    await launched(f);
    f.dependencies.save = vi.fn(() => {
      throw new Error('disk full');
    });
    await expect(f.engine.setEnabled(routine.id, false)).rejects.toThrow('disk full');
    expect(f.engine.state().routines[0]!.runs[0]!.finishedAt).toBeUndefined();
    start.resolve('turn');
    await vi.waitFor(() =>
      expect(f.dependencies.cancel).toHaveBeenCalledWith('root', 'thread', 'turn'),
    );
    await vi.waitFor(() =>
      expect(f.engine.state().routines[0]!.runs[0]!.state).toBe('interrupted'),
    );
    expect(f.dependencies.cancel).toHaveBeenCalledOnce();
    expect(f.engine.state().error).toMatch(/store could not be written/);
  });

  it('bounds unidentified lifecycle evidence and stops only the returned turn on overflow', async () => {
    const f = fixture();
    const start = deferred<string>();
    f.dependencies.start = vi.fn(() => start.promise);
    f.engine.create(f.input);
    f.advance(60_000);
    await launched(f);
    for (let index = 0; index < 101; index += 1) {
      f.engine.note('root', {
        type: 'user-input-requested',
        threadId: 'thread',
        turnId: 'another-actor-turn',
        requestId: `input-${index}`,
        question: 'Continue?',
      });
    }
    expect(f.engine.state().routines[0]!.schedule.enabled).toBe(false);
    expect(f.engine.state().routines[0]!.pausedReason).toMatch(/outcome is unknown/);
    expect(f.dependencies.cancel).not.toHaveBeenCalled();
    start.resolve('turn');
    await vi.waitFor(() =>
      expect(f.engine.state().routines[0]!.runs[0]!.state).toBe('interrupted'),
    );
    expect(f.dependencies.cancel).toHaveBeenCalledOnce();
    expect(f.dependencies.cancel).toHaveBeenCalledWith('root', 'thread', 'turn');
  });

  it('does not overwrite a confirmed terminal event when cancellation later rejects', async () => {
    const f = fixture();
    const cancel = deferred<void>();
    const routine = f.engine.create(f.input);
    f.advance(60_000);
    await launched(f);
    f.dependencies.cancel = vi.fn(() => cancel.promise);
    const paused = f.engine.setEnabled(routine.id, false);
    await vi.waitFor(() => expect(f.dependencies.cancel).toHaveBeenCalledOnce());
    f.engine.note('root', finished());
    cancel.reject(new Error('interrupt timed out'));
    await paused;
    expect(f.engine.state().routines[0]!.runs[0]!.state).toBe('completed');
    expect(f.engine.state().routines[0]!.pausedReason).toBeNull();
  });

  it('does not dispatch a queued cancellation after the owned turn already finished', async () => {
    const f = fixture();
    const routine = f.engine.create(f.input);
    f.advance(60_000);
    await launched(f);
    const paused = f.engine.setEnabled(routine.id, false);
    f.engine.note('root', finished());
    await paused;
    expect(f.dependencies.cancel).not.toHaveBeenCalled();
    expect(f.engine.state().routines[0]!.runs[0]!.state).toBe('completed');
  });

  it('does not launch if durable claim persistence fails', async () => {
    const f = fixture();
    f.engine.create(f.input);
    f.dependencies.save = vi.fn(() => {
      throw new Error('disk full');
    });
    f.advance(60_000);
    await expect(f.engine.tick()).rejects.toThrow('disk full');
    expect(f.dependencies.createSession).not.toHaveBeenCalled();
  });

  it('refuses a create that exceeds store capacity without stopping or keeping the candidate', async () => {
    const f = fixture();
    const kept = f.engine.create(f.input);
    f.dependencies.save = vi.fn(() => {
      throw new LocalRoutineCapacityError('The local routine store is full.');
    });
    expect(() => f.engine.create({ ...f.input, name: 'One too many' })).toThrow(
      LocalRoutineCapacityError,
    );
    expect(f.engine.state().error).toBeNull();
    expect(f.engine.state().routines.map((routine) => routine.id)).toEqual([kept.id]);

    f.dependencies.save = vi.fn();
    f.advance(60_000);
    await launched(f);
    await f.engine.remove(kept.id);
    expect(f.engine.state().routines).toEqual([]);
    expect(() => f.engine.create({ ...f.input, name: 'After cleanup' })).not.toThrow();
  });

  it('still stops the engine when a create fails for a storage reason', () => {
    const f = fixture();
    f.dependencies.save = vi.fn(() => {
      throw new Error('disk full');
    });
    expect(() => f.engine.create(f.input)).toThrow('disk full');
    expect(f.engine.state().error).toMatch(/store could not be written/);
    expect(() => f.engine.create(f.input)).toThrow(/unavailable/);
  });

  it('keeps a capacity refusal on an existing routine fatal because memory is ahead of disk', async () => {
    const f = fixture();
    const routine = f.engine.create(f.input);
    f.dependencies.save = vi.fn(() => {
      throw new LocalRoutineCapacityError('The local routine store is full.');
    });
    await expect(f.engine.setEnabled(routine.id, false)).rejects.toThrow(LocalRoutineCapacityError);
    expect(f.engine.state().error).toMatch(/store could not be written/);
  });

  it('marks sleep interruption explicitly and never duplicates that claim on wake', async () => {
    const f = fixture();
    f.engine.create(f.input);
    f.advance(60_000);
    await launched(f);
    await f.engine.suspend();
    f.advance(10_000);
    f.engine.resume();
    await f.engine.tick();
    expect(f.dependencies.cancel).toHaveBeenCalledOnce();
    expect(f.dependencies.start).toHaveBeenCalledOnce();
    expect(f.release).toHaveBeenCalledOnce();
    expect(f.engine.state().routines[0]!.runs[0]!.state).toBe('interrupted');
  });

  it.each(['skip', 'run_once'] as const)(
    'applies the selected missed-run policy without a catch-up storm: %s',
    async (policy) => {
      const f = fixture();
      f.engine.create({ ...f.input, missedExecutionPolicy: policy });
      f.advance(3_600_000);
      await f.engine.tick();
      if (policy === 'run_once')
        await vi.waitFor(() => expect(f.dependencies.start).toHaveBeenCalledOnce());
      else expect(f.dependencies.start).not.toHaveBeenCalled();
      expect(f.engine.state().routines[0]!.runs).toHaveLength(1);
      await f.engine.tick();
      expect(f.engine.state().routines[0]!.runs).toHaveLength(1);
    },
  );

  it('releases awake state while any of several approvals remains unanswered', async () => {
    const f = fixture();
    f.engine.create(f.input);
    f.advance(60_000);
    await launched(f);
    const requested = (requestId: string): DeveloperSessionEvent => ({
      type: 'approval-requested',
      threadId: 'thread',
      turnId: 'turn',
      requestId,
      kind: 'exec',
      summary: 'Tests',
      detail: '',
      command: 'cargo test',
      riskLevel: null,
      reversible: null,
      proposedCommandPrefix: null,
    });
    f.engine.note('root', requested('first'));
    f.engine.note('root', requested('second'));
    f.engine.note('root', {
      type: 'approval-answered',
      threadId: 'thread',
      turnId: 'turn',
      requestId: 'first',
      decision: 'approve_once',
      approved: true,
    });
    expect(f.dependencies.keepAwake).toHaveBeenCalledOnce();
    expect(f.engine.state().routines[0]!.runs[0]!.state).toBe('awaiting_input');
    f.engine.note('root', {
      type: 'approval-answered',
      threadId: 'thread',
      turnId: 'turn',
      requestId: 'second',
      decision: 'deny',
      approved: false,
    });
    expect(f.dependencies.keepAwake).toHaveBeenCalledTimes(2);
    f.engine.note('root', finished('failed'));
    expect(f.release).toHaveBeenCalledTimes(2);
  });

  it('honors per-routine notification consent and rejects unsupported email delivery', async () => {
    const f = fixture();
    expect(() =>
      f.engine.create({
        ...f.input,
        notificationSettings: { ...f.input.notificationSettings, email: true },
      }),
    ).toThrow(/do not send email/);
    f.engine.create({
      ...f.input,
      notificationSettings: { ...f.input.notificationSettings, onSuccess: false },
    });
    f.advance(60_000);
    await launched(f);
    expect(f.engine.note('root', finished())).toEqual({ notify: false });
  });
});

it('restores elapsed one-shot history and replays its create identity without running it twice', async () => {
  const f = fixture();
  const input: LocalRoutineInput = {
    ...f.input,
    schedule: { type: 'once', enabled: true, executeAt: '2026-10-16T09:01:00Z' },
  };
  const first = f.engine.create(input);
  f.advance(60_000);
  await launched(f);
  f.engine.note('root', finished());
  f.advance(3_600_000);
  const restored = new LocalRoutineEngine(f.dependencies, f.saved.at(-1)!);
  expect(restored.create(input, first.id).id).toBe(first.id);
  await restored.tick();
  expect(f.dependencies.start).toHaveBeenCalledOnce();
  expect(restored.state().routines[0]!.runs[0]!.state).toBe('completed');
});

it('restores an unclaimed elapsed one-shot and applies its selected missed-run policy', async () => {
  const f = fixture();
  f.engine.create({
    ...f.input,
    schedule: { type: 'once', enabled: true, executeAt: '2026-10-16T09:01:00Z' },
    missedExecutionPolicy: 'skip',
  });
  f.advance(3_600_000);
  const restored = new LocalRoutineEngine(f.dependencies, f.saved.at(-1)!);
  await restored.tick();
  expect(f.dependencies.start).not.toHaveBeenCalled();
  expect(restored.state().routines[0]!.runs[0]!.state).toBe('skipped');
});
