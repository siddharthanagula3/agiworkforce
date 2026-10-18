import { describe, expect, it, vi } from 'vitest';
import type {
  LocalRoutine,
  LocalRoutineInput,
  DeveloperSessionEvent,
} from '@agiworkforce/local-runtime-contract';
import { LocalRoutineEngine, type LocalRoutineDependencies } from '../runtime/localRoutineEngine';

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
