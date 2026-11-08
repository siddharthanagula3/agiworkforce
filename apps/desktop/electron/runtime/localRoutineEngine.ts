import { createHash, randomUUID } from 'node:crypto';
import type {
  DeveloperSessionEvent,
  LocalRoutine,
  LocalRoutineInput,
  LocalRoutineRun,
  LocalRoutineState,
} from '@agiworkforce/local-runtime-contract';
import {
  getNextExecutionAt,
  validateTimeZone,
  type ScheduleTiming,
} from '@agiworkforce/utils/scheduling/schedule-time';

// The existing schedule owner enforces cadence and timezone semantics for both surfaces.
function timing(schedule: LocalRoutineInput['schedule']): ScheduleTiming {
  return {
    scheduleType: schedule.type,
    cronExpression: schedule.cron,
    executeAt: schedule.executeAt,
    intervalMs: schedule.intervalMs,
    timezone: schedule.timezone ?? 'UTC',
  };
}

function next(input: LocalRoutineInput, after: Date): string | null {
  try {
    return getNextExecutionAt(timing(input.schedule), after)?.toISOString() ?? null;
  } catch (error) {
    if (error instanceof Error && error.name === 'NoFurtherOccurrenceError') return null;
    throw error;
  }
}

export function validateLocalRoutineInput(value: unknown, now: Date): LocalRoutineInput {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('A local routine is required.');
  const input = value as LocalRoutineInput;
  for (const [field, limit] of [
    ['name', 200],
    ['rootId', 200],
    ['model', 200],
    ['prompt', 100_000],
  ] as const) {
    if (typeof input[field] !== 'string' || !input[field].trim() || input[field].length > limit)
      throw new Error(`Invalid local routine ${field}.`);
  }
  if (
    !input.schedule ||
    !['once', 'interval', 'cron'].includes(input.schedule.type) ||
    typeof input.schedule.enabled !== 'boolean'
  )
    throw new Error('Local routines support once, interval and cron schedules.');
  if (input.missedExecutionPolicy !== 'run_once' && input.missedExecutionPolicy !== 'skip')
    throw new Error('Choose how to handle a missed run.');
  if (typeof input.keepAwake !== 'boolean')
    throw new Error('Choose whether this routine may keep the computer awake.');
  if (
    !input.notificationSettings ||
    ['onSuccess', 'onFailure', 'onApproval', 'push', 'email'].some(
      (key) =>
        typeof input.notificationSettings[key as keyof typeof input.notificationSettings] !==
        'boolean',
    )
  )
    throw new Error('Local routine notification settings are invalid.');
  if (input.notificationSettings.email)
    throw new Error(
      'Local routines do not send email. Use Desktop notifications or a cloud routine.',
    );
  validateTimeZone(input.schedule.timezone ?? 'UTC');
  const schedule = input.schedule;
  if (
    schedule.maxExecutions !== undefined &&
    (!Number.isSafeInteger(schedule.maxExecutions) || schedule.maxExecutions < 1)
  )
    throw new Error('The run limit must be a positive integer.');
  if (schedule.expiresAt !== undefined && !Number.isFinite(Date.parse(schedule.expiresAt)))
    throw new Error('The expiry timestamp is invalid.');
  next(input, now);
  return structuredClone({
    name: input.name.trim(),
    rootId: input.rootId,
    model: input.model,
    prompt: input.prompt,
    schedule: {
      type: schedule.type,
      enabled: schedule.enabled,
      ...(schedule.cron !== undefined ? { cron: schedule.cron } : {}),
      ...(schedule.executeAt !== undefined ? { executeAt: schedule.executeAt } : {}),
      ...(schedule.intervalMs !== undefined ? { intervalMs: schedule.intervalMs } : {}),
      timezone: schedule.timezone ?? 'UTC',
      ...(schedule.expiresAt !== undefined ? { expiresAt: schedule.expiresAt } : {}),
      ...(schedule.maxExecutions !== undefined ? { maxExecutions: schedule.maxExecutions } : {}),
    },
    missedExecutionPolicy: input.missedExecutionPolicy,
    keepAwake: input.keepAwake,
    notificationSettings: {
      onSuccess: input.notificationSettings.onSuccess,
      onFailure: input.notificationSettings.onFailure,
      onApproval: input.notificationSettings.onApproval,
      push: input.notificationSettings.push,
      email: input.notificationSettings.email,
    },
  });
}

export interface RoutineAuthority {
  rootIdentity: string;
  grantRevision: string;
}
export interface LocalRoutineDependencies {
  deviceId: string;
  now(): Date;
  save(routines: readonly LocalRoutine[]): void;
  authority(rootId: string): RoutineAuthority | null;
  createSession(rootId: string, model: string, title: string): Promise<string>;
  start(
    rootId: string,
    threadId: string,
    model: string,
    prompt: string,
    stillAuthorized: () => boolean,
  ): Promise<string>;
  cancel(rootId: string, threadId: string, turnId: string): Promise<void>;
  keepAwake(): () => void;
}

const TERMINAL = new Set<LocalRoutineRun['state']>([
  'completed',
  'failed',
  'cancelled',
  'interrupted',
  'skipped',
]);
const HISTORY_LIMIT = 20;
const MISSED_GRACE_MS = 120_000;
const PENDING_START_EVENT_LIMIT = 100;

interface RoutineStopRequest {
  state: 'interrupted' | 'cancelled';
  reason: string;
  pausedReason: string | null;
  attempt?: Promise<void>;
}

type RoutineLifecycleEvent =
  | {
      type:
        'approval-requested' | 'approval-answered' | 'user-input-requested' | 'user-input-answered';
      threadId: string;
      turnId: string;
      requestId: string;
    }
  | {
      type: 'turn-finished';
      threadId: string;
      turnId: string;
      outcome: Extract<DeveloperSessionEvent, { type: 'turn-finished' }>['outcome'];
    };

function lifecycleEvent(event: DeveloperSessionEvent): RoutineLifecycleEvent | null {
  if (
    event.type === 'approval-requested' ||
    event.type === 'approval-answered' ||
    event.type === 'user-input-requested' ||
    event.type === 'user-input-answered'
  ) {
    const { type, threadId, turnId, requestId } = event;
    return { type, threadId, turnId, requestId };
  }
  if (event.type === 'turn-finished') {
    const { type, threadId, turnId, outcome } = event;
    return { type, threadId, turnId, outcome };
  }
  return null;
}

export class LocalRoutineEngine {
  private routines: LocalRoutine[];
  private suspended = false;
  private busy = false;
  private stopped = false;
  private fault: string | null = null;
  private releases = new Map<string, () => void>();
  private pending = new Map<string, Set<string>>();
  private startRequests = new Set<string>();
  private startEvents = new Map<string, RoutineLifecycleEvent[]>();
  private stopRequests = new Map<string, RoutineStopRequest>();

  constructor(
    private readonly dependencies: LocalRoutineDependencies,
    stored: readonly LocalRoutine[] = [],
  ) {
    this.routines = structuredClone([...stored]);
    for (const routine of this.routines) {
      validateLocalRoutineInput(routine, new Date(routine.createdAt));
      if (
        typeof routine.id !== 'string' ||
        routine.deviceId !== dependencies.deviceId ||
        !Array.isArray(routine.runs) ||
        typeof routine.rootIdentity !== 'string' ||
        typeof routine.grantRevision !== 'string'
      )
        throw new Error('The local routine store does not belong to this device or is damaged.');
      if (
        !/^[a-f0-9]{64}$/.test(routine.creationDigest) ||
        !Number.isSafeInteger(routine.executionCount) ||
        routine.executionCount < 0 ||
        (routine.nextExecutionAt !== null &&
          !Number.isFinite(Date.parse(routine.nextExecutionAt))) ||
        !Number.isFinite(Date.parse(routine.createdAt)) ||
        !Number.isFinite(Date.parse(routine.updatedAt))
      )
        throw new Error('The local routine lifecycle record is damaged.');
      for (const run of routine.runs) {
        if (
          !run ||
          typeof run.id !== 'string' ||
          !Number.isFinite(Date.parse(run.dueAt)) ||
          !Number.isFinite(Date.parse(run.startedAt)) ||
          !['starting', 'running', 'awaiting_input', ...TERMINAL].includes(run.state)
        )
          throw new Error('The local routine run record is damaged.');
        if (!TERMINAL.has(run.state)) {
          run.state = 'interrupted';
          run.finishedAt = dependencies.now().toISOString();
          run.error =
            'The app stopped before this run settled. Its effects are unknown; it was not replayed.';
          routine.schedule.enabled = false;
          routine.pausedReason = run.error;
        }
      }
    }
    if (stored.length) this.persist();
  }

  state(): LocalRoutineState {
    return structuredClone({
      deviceId: this.dependencies.deviceId,
      suspended: this.suspended,
      error: this.fault,
      routines: this.routines,
    });
  }

  private persist(): void {
    try {
      this.dependencies.save(this.routines);
    } catch (error) {
      const firstFailure = this.fault === null;
      this.fault =
        'The local routine store could not be written. Runs were stopped where possible. Repair storage and restart before resuming.';
      this.stopped = true;
      for (const release of this.releases.values()) release();
      this.releases.clear();
      if (firstFailure)
        for (const routine of this.routines) {
          const run = this.active(routine);
          if (!run) continue;
          const stop = this.requestStop(routine, run, 'interrupted', this.fault);
          if (run.threadId && run.turnId)
            void this.cancelRun(routine, run, stop).catch((stopError: unknown) => {
              console.warn(
                '[local-routines] stop after persistence failure could not be recorded:',
                stopError,
              );
            });
        }
      throw error;
    }
  }

  private authorized(routine: LocalRoutine): boolean {
    const authority = this.dependencies.authority(routine.rootId);
    return (
      routine.deviceId === this.dependencies.deviceId &&
      authority?.rootIdentity === routine.rootIdentity &&
      authority.grantRevision === routine.grantRevision
    );
  }

  create(value: unknown, id: string = randomUUID()): LocalRoutine {
    if (this.stopped)
      throw new Error('The local routine store is unavailable. Restart after repairing it.');
    const now = this.dependencies.now();
    const existing = this.routines.find((entry) => entry.id === id);
    const input = validateLocalRoutineInput(value, existing ? new Date(existing.createdAt) : now);
    const creationDigest = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    if (existing) {
      if (existing.creationDigest !== creationDigest)
        throw new Error('This create request already belongs to another routine.');
      return structuredClone(existing);
    }
    const authority = this.dependencies.authority(input.rootId);
    if (!authority)
      throw new Error('Allow the coding agent in this folder before enabling a local routine.');
    const routine: LocalRoutine = {
      ...input,
      ...authority,
      id,
      creationDigest,
      deviceId: this.dependencies.deviceId,
      nextExecutionAt: next(input, now),
      executionCount: 0,
      pausedReason: null,
      runs: [],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    this.routines.push(routine);
    this.persist();
    return structuredClone(routine);
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    if (this.fault) throw new Error(this.fault);
    const routine = this.routines.find((entry) => entry.id === id);
    if (!routine) throw new Error('That local routine no longer exists.');
    if (enabled) {
      const run = this.active(routine);
      if (run && this.stopRequests.has(run.id))
        throw new Error('The stop has not been acknowledged. Open the run before resuming.');
      if (run && this.startRequests.has(run.id) && run.error)
        throw new Error('The run outcome is unknown. Open the run before resuming.');
      const authority = this.dependencies.authority(routine.rootId);
      if (!authority) throw new Error('Allow the coding agent in this folder before resuming.');
      Object.assign(routine, authority);
      routine.nextExecutionAt = next(routine, this.dependencies.now());
      routine.pausedReason = null;
    }
    routine.schedule.enabled = enabled;
    routine.updatedAt = this.dependencies.now().toISOString();
    this.persist();
    if (!enabled) await this.cancelActive(routine, 'cancelled', 'The routine was paused.');
  }

  async remove(id: string): Promise<void> {
    if (this.fault) throw new Error(this.fault);
    const routine = this.routines.find((entry) => entry.id === id);
    if (!routine) return;
    routine.schedule.enabled = false;
    this.persist();
    await this.cancelActive(routine, 'cancelled', 'The routine was removed.');
    if (this.active(routine))
      throw new Error('The run could not be stopped. Its ownership record was retained.');
    this.routines = this.routines.filter((entry) => entry.id !== id);
    this.persist();
  }

  private release(run: LocalRoutineRun): void {
    this.releases.get(run.id)?.();
    this.releases.delete(run.id);
  }
  private active(routine: LocalRoutine): LocalRoutineRun | undefined {
    return routine.runs.find((run) => !TERMINAL.has(run.state));
  }

  private requestStop(
    routine: LocalRoutine,
    run: LocalRoutineRun,
    state: RoutineStopRequest['state'],
    reason: string,
  ): RoutineStopRequest {
    this.release(run);
    let stop = this.stopRequests.get(run.id);
    if (!stop) {
      stop = {
        state,
        reason,
        pausedReason: routine.pausedReason === run.error ? null : routine.pausedReason,
      };
      this.stopRequests.set(run.id, stop);
    }
    return stop;
  }

  private clearOwnership(routine: LocalRoutine, run: LocalRoutineRun): void {
    if (run.error && routine.pausedReason === run.error)
      routine.pausedReason = this.stopRequests.get(run.id)?.pausedReason ?? null;
    this.startRequests.delete(run.id);
    this.startEvents.delete(run.id);
    this.stopRequests.delete(run.id);
    this.pending.delete(run.id);
  }

  private finishStop(routine: LocalRoutine, run: LocalRoutineRun, stop: RoutineStopRequest): void {
    if (TERMINAL.has(run.state)) return;
    this.clearOwnership(routine, run);
    run.state = stop.state;
    run.finishedAt = this.dependencies.now().toISOString();
    run.error = stop.reason;
    this.persist();
  }

  private cancelRun(
    routine: LocalRoutine,
    run: LocalRoutineRun,
    stop: RoutineStopRequest,
  ): Promise<void> {
    if (stop.attempt) return stop.attempt;
    const { threadId, turnId } = run;
    if (!threadId || !turnId || TERMINAL.has(run.state)) return Promise.resolve();
    stop.attempt = Promise.resolve()
      .then(() =>
        TERMINAL.has(run.state)
          ? undefined
          : this.dependencies.cancel(routine.rootId, threadId, turnId),
      )
      .then(
        () => this.finishStop(routine, run, stop),
        () => {
          if (TERMINAL.has(run.state)) return;
          routine.schedule.enabled = false;
          run.error = 'The stop was not acknowledged. Open the run and stop it before resuming.';
          routine.pausedReason = run.error;
          this.persist();
        },
      );
    return stop.attempt;
  }

  private async cancelActive(
    routine: LocalRoutine,
    state: 'interrupted' | 'cancelled',
    reason: string,
  ): Promise<void> {
    const run = this.active(routine);
    if (!run) return;
    const stop = this.requestStop(routine, run, state, reason);
    if (run.threadId && run.turnId) {
      await this.cancelRun(routine, run, stop);
      return;
    }
    if (this.startRequests.has(run.id)) {
      run.error =
        'A stop was requested, but this run has not been identified. Its effects are unknown.';
      routine.pausedReason = run.error;
      this.persist();
      return;
    }
    this.finishStop(routine, run, stop);
  }

  async suspend(): Promise<void> {
    this.suspended = true;
    await Promise.all(
      this.routines.map((routine) =>
        this.cancelActive(
          routine,
          'interrupted',
          'The computer suspended. This run was not replayed.',
        ),
      ),
    );
  }
  resume(): void {
    this.suspended = false;
  }
  async stop(): Promise<void> {
    this.stopped = true;
    await this.suspend();
  }

  async tick(): Promise<void> {
    if (this.stopped || this.suspended || this.busy) return;
    this.busy = true;
    try {
      for (const routine of this.routines) {
        if (!routine.schedule.enabled && !this.active(routine)) continue;
        if (!this.authorized(routine)) {
          routine.schedule.enabled = false;
          routine.pausedReason =
            'The device, folder or command grant changed. Review and resume this routine.';
          this.persist();
          await this.cancelActive(routine, 'cancelled', routine.pausedReason);
          continue;
        }
        if (this.active(routine)) continue;
        const now = this.dependencies.now();
        if (
          (routine.schedule.expiresAt && Date.parse(routine.schedule.expiresAt) <= now.getTime()) ||
          (routine.schedule.maxExecutions !== undefined &&
            routine.executionCount >= routine.schedule.maxExecutions)
        ) {
          routine.schedule.enabled = false;
          routine.pausedReason = 'The routine reached its expiry or run limit.';
          this.persist();
          continue;
        }
        if (!routine.nextExecutionAt || Date.parse(routine.nextExecutionAt) > now.getTime())
          continue;
        const dueAt = routine.nextExecutionAt;
        const run: LocalRoutineRun = {
          id: randomUUID(),
          dueAt,
          startedAt: now.toISOString(),
          state:
            routine.missedExecutionPolicy === 'skip' &&
            now.getTime() - Date.parse(dueAt) > MISSED_GRACE_MS
              ? 'skipped'
              : 'starting',
        };
        routine.runs = [...routine.runs.slice(-(HISTORY_LIMIT - 1)), run];
        routine.nextExecutionAt = routine.schedule.type === 'once' ? null : next(routine, now);
        if (!routine.nextExecutionAt) routine.schedule.enabled = false;
        if (run.state === 'skipped') {
          run.finishedAt = now.toISOString();
          this.persist();
          continue;
        }
        routine.executionCount += 1;
        this.persist();
        // Launch is deliberately outside the sweep: one child waiting for approval cannot block siblings.
        void this.launch(routine, run).catch(() => {
          this.stopped = true;
        });
      }
    } finally {
      this.busy = false;
    }
  }

  private async launch(routine: LocalRoutine, run: LocalRoutineRun): Promise<void> {
    try {
      if (!this.authorized(routine) || this.stopped || this.suspended || TERMINAL.has(run.state))
        throw new Error('The routine lost its launch authority.');
      run.threadId = await this.dependencies.createSession(
        routine.rootId,
        routine.model,
        routine.name,
      );
      this.persist();
      const stillAuthorized = () =>
        !this.stopped &&
        !this.suspended &&
        !TERMINAL.has(run.state) &&
        !this.stopRequests.has(run.id) &&
        this.authorized(routine);
      if (!stillAuthorized()) throw new Error('The routine lost its launch authority.');
      if (routine.keepAwake) this.releases.set(run.id, this.dependencies.keepAwake());
      this.startRequests.add(run.id);
      const turnId = await this.dependencies.start(
        routine.rootId,
        run.threadId,
        routine.model,
        routine.prompt,
        stillAuthorized,
      );
      if (!TERMINAL.has(run.state)) {
        run.turnId = turnId;
        if (run.state !== 'awaiting_input') run.state = 'running';
        const events = this.startEvents.get(run.id) ?? [];
        this.startEvents.delete(run.id);
        for (const event of events) {
          if (TERMINAL.has(run.state)) break;
          if (event.turnId === turnId) this.applyLifecycle(routine, run, event);
        }
        this.persist();
        const stop = this.stopRequests.get(run.id);
        if (stop) await this.cancelRun(routine, run, stop);
      }
    } catch (error) {
      if (!TERMINAL.has(run.state)) {
        if (this.startRequests.has(run.id)) {
          run.error = run.turnId
            ? 'The run could not be recorded. Its effects are unknown. Open the run before resuming.'
            : 'The start was not acknowledged. Its effects are unknown. Open the run before resuming.';
        } else {
          run.state = 'failed';
          run.finishedAt = this.dependencies.now().toISOString();
          run.error = error instanceof Error ? error.message : 'Local routine startup failed.';
        }
        routine.schedule.enabled = false;
        routine.pausedReason = run.error;
        const stop = this.stopRequests.get(run.id);
        if (stop && run.threadId && run.turnId) await this.cancelRun(routine, run, stop);
      }
      this.release(run);
      this.persist();
    }
  }

  note(rootId: string, event: DeveloperSessionEvent): { notify: boolean } {
    if (this.fault) return { notify: false };
    let notify = true;
    const lifecycle = lifecycleEvent(event);
    for (const routine of this.routines) {
      if (routine.rootId !== rootId) continue;
      const run = this.active(routine);
      if (!run) continue;
      if (event.type === 'runtime-stopped') {
        this.clearOwnership(routine, run);
        run.state = 'interrupted';
        run.error = 'The local runtime stopped; this run was not replayed.';
        run.finishedAt = this.dependencies.now().toISOString();
        routine.schedule.enabled = false;
        routine.pausedReason = run.error;
        this.release(run);
        this.persist();
        continue;
      }
      if (
        !lifecycle ||
        lifecycle.threadId !== run.threadId ||
        (run.turnId && lifecycle.turnId !== run.turnId)
      )
        continue;
      if (!run.turnId) {
        if (!this.startRequests.has(run.id)) continue;
        notify = false;
        const events = this.startEvents.get(run.id) ?? [];
        if (events.length < PENDING_START_EVENT_LIMIT) {
          events.push(lifecycle);
          this.startEvents.set(run.id, events);
        } else {
          this.requestStop(
            routine,
            run,
            'interrupted',
            'The run exceeded the pending startup activity limit.',
          );
          routine.schedule.enabled = false;
          run.error =
            'Startup activity could not be retained. The run outcome is unknown until its start is acknowledged.';
          routine.pausedReason = run.error;
          this.persist();
        }
        continue;
      }
      notify = this.applyLifecycle(routine, run, lifecycle);
    }
    return { notify };
  }

  private applyLifecycle(
    routine: LocalRoutine,
    run: LocalRoutineRun,
    event: RoutineLifecycleEvent,
  ): boolean {
    let notify = true;
    if (event.type === 'approval-requested' || event.type === 'user-input-requested') {
      const requests = this.pending.get(run.id) ?? new Set<string>();
      requests.add(event.requestId);
      this.pending.set(run.id, requests);
      run.state = 'awaiting_input';
      this.release(run);
      notify = routine.notificationSettings.push && routine.notificationSettings.onApproval;
    } else if (event.type === 'approval-answered' || event.type === 'user-input-answered') {
      const requests = this.pending.get(run.id);
      requests?.delete(event.requestId);
      if (!requests?.size) {
        run.state = 'running';
        if (routine.keepAwake && !this.stopRequests.has(run.id) && !this.releases.has(run.id))
          this.releases.set(run.id, this.dependencies.keepAwake());
      }
    } else if (event.type === 'turn-finished') {
      this.clearOwnership(routine, run);
      run.state =
        event.outcome === 'completed'
          ? 'completed'
          : event.outcome === 'interrupted'
            ? 'cancelled'
            : 'failed';
      run.finishedAt = this.dependencies.now().toISOString();
      this.release(run);
      notify =
        routine.notificationSettings.push &&
        (run.state === 'completed'
          ? routine.notificationSettings.onSuccess
          : routine.notificationSettings.onFailure);
    }
    this.persist();
    return notify;
  }
}
