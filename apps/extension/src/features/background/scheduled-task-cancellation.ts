import type { ManagedCloudAgentRunReference } from '@agiworkforce/cloud-contracts';
import { logger, sleep } from '../../utils';
import {
  removeScheduledTaskRunJournal,
  updateScheduledTaskRunJournal,
  type ScheduledTaskRunJournal,
} from './scheduled-task-runs';
import {
  cancelChromeManagedRun,
  findChromeManagedRunByRequestId,
} from '../cloud-bridge/managedRunControl';
import type { ManagedCloudOwner } from '../cloud-bridge/managedCloudAuthority';

const RETRY_BASE_MS = 5_000;
const RETRY_MAX_MS = 5 * 60_000;
const DISPATCH_ABSENCE_GRACE_MS = 5 * 60_000;
const DISPATCH_ABSENCE_MIN_OBSERVATIONS = 3;
const CANCELLATION_IO_TIMEOUT_MS = 10_000;

class ScheduledTaskCancellationIoTimeoutError extends Error {
  constructor() {
    super('Scheduled Managed Cloud cancellation I/O timed out.');
    this.name = 'ScheduledTaskCancellationIoTimeoutError';
  }
}

async function runBoundedCancellationIo<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutResult = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new ScheduledTaskCancellationIoTimeoutError());
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation(controller.signal), timeoutResult]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export interface ScheduledTaskCancellationStrength {
  hasCredential: boolean;
  hasKnownRun: boolean;
}

interface ActiveScheduledTaskCancellation {
  strength: ScheduledTaskCancellationStrength;
  promise: Promise<boolean>;
}

export class ScheduledTaskCancellationAttemptCoordinator {
  private readonly active = new Map<string, ActiveScheduledTaskCancellation>();

  run(
    requestId: string,
    strength: ScheduledTaskCancellationStrength,
    attempt: () => Promise<boolean>,
  ): Promise<boolean> {
    const current = this.active.get(requestId);
    if (current) {
      const currentDominates =
        (!strength.hasCredential || current.strength.hasCredential) &&
        (!strength.hasKnownRun || current.strength.hasKnownRun);
      if (currentDominates) return current.promise;
      return current.promise.then(
        (settled) => (settled ? true : this.run(requestId, strength, attempt)),
        () => this.run(requestId, strength, attempt),
      );
    }

    const started = Promise.resolve().then(attempt);
    const tracked = started.finally(() => {
      if (this.active.get(requestId)?.promise === tracked) this.active.delete(requestId);
    });
    this.active.set(requestId, { strength, promise: tracked });
    return tracked;
  }
}

export interface ScheduledTaskCancellationCredential {
  token: string;
  owner: ManagedCloudOwner;
}

export function selectScheduledTaskCancellationCredential(
  expectedOwner: ManagedCloudOwner,
  captured: ScheduledTaskCancellationCredential | null | undefined,
  ambient: ScheduledTaskCancellationCredential | null | undefined,
): ScheduledTaskCancellationCredential | null {
  if (captured?.owner.accountId === expectedOwner.accountId) return captured;
  return ambient?.owner.accountId === expectedOwner.accountId ? ambient : null;
}

interface ScheduledTaskCancellationDependencies {
  updateJournal: typeof updateScheduledTaskRunJournal;
  removeJournal: typeof removeScheduledTaskRunJournal;
  findRun: typeof findChromeManagedRunByRequestId;
  cancelRun: typeof cancelChromeManagedRun;
  wait: typeof sleep;
  now: () => number;
  ioTimeoutMs: number;
  warn: (message: string, detail: unknown) => void;
}

const DEFAULT_DEPENDENCIES: ScheduledTaskCancellationDependencies = {
  updateJournal: updateScheduledTaskRunJournal,
  removeJournal: removeScheduledTaskRunJournal,
  findRun: findChromeManagedRunByRequestId,
  cancelRun: cancelChromeManagedRun,
  wait: sleep,
  now: Date.now,
  ioTimeoutMs: CANCELLATION_IO_TIMEOUT_MS,
  warn: (message, detail) => logger.warn(message, detail),
};

export function isScheduledRunCancellationTerminal(state: unknown): boolean {
  return (
    state === 'ready_for_review' ||
    state === 'completed' ||
    state === 'failed' ||
    state === 'cancelled' ||
    state === 'archived'
  );
}

function isScheduledRunCancellationSettled(run: ManagedCloudAgentRunReference): boolean {
  if (isScheduledRunCancellationTerminal(run.state)) return true;
  return (
    Boolean(run.cancellationRequestedAt) &&
    (run.state === 'awaiting_input' || run.state === 'paused')
  );
}

export function isScheduledCancellationRetryDue(
  journal: ScheduledTaskRunJournal,
  now = Date.now(),
): boolean {
  if (!journal.cancellationPending || journal.cancellationLastAttemptAt === undefined) return true;
  const exponent = Math.min(journal.cancellationAttempts, 6);
  const delay = Math.min(RETRY_BASE_MS * 2 ** exponent, RETRY_MAX_MS);
  return now - journal.cancellationLastAttemptAt >= delay;
}

export async function requestScheduledTaskCancellation(
  initialJournal: ScheduledTaskRunJournal,
  credential?: ScheduledTaskCancellationCredential | null,
  knownRun?: ManagedCloudAgentRunReference,
  dependencies: Partial<ScheduledTaskCancellationDependencies> = {},
): Promise<boolean> {
  const resolved = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  const requestedAt = initialJournal.cancellationRequestedAt ?? resolved.now();
  let journal =
    (await resolved.updateJournal(initialJournal.taskId, initialJournal.requestId, {
      cancellationPending: true,
      cancellationRequestedAt: requestedAt,
      ...(knownRun ? { cloudRun: knownRun } : {}),
    })) ?? initialJournal;

  if (journal.dispatchPreparedAt !== undefined && journal.dispatchStartedAt === undefined) {
    await resolved.removeJournal(journal.taskId, journal.requestId);
    return true;
  }
  if (!credential || credential.owner.accountId !== journal.owner.accountId) return false;

  const attemptedAt = resolved.now();
  journal =
    (await resolved.updateJournal(journal.taskId, journal.requestId, {
      cancellationPending: true,
      cancellationRequestedAt: requestedAt,
      cancellationAttempts: Math.min(journal.cancellationAttempts + 1, 10_000),
      cancellationLastAttemptAt: attemptedAt,
      ...(knownRun ? { cloudRun: knownRun } : {}),
    })) ?? journal;

  let cancellationRun = knownRun ?? journal.cloudRun;
  let exactAbsenceObserved = false;
  if (cancellationRun && isScheduledRunCancellationSettled(cancellationRun)) {
    await resolved.removeJournal(journal.taskId, journal.requestId);
    return true;
  }
  if (!cancellationRun) {
    for (let attempt = 0; attempt < 3 && !cancellationRun; attempt += 1) {
      try {
        const found = await runBoundedCancellationIo(
          (signal) =>
            resolved.findRun(
              journal.requestId,
              {
                getAuthToken: async () => credential.token,
              },
              signal,
            ),
          resolved.ioTimeoutMs,
        );
        cancellationRun = found ?? undefined;
        if (!found) exactAbsenceObserved = true;
      } catch (error) {
        resolved.warn('Scheduled Managed Cloud cancellation lookup failed', {
          taskId: journal.taskId,
          attempt: attempt + 1,
          error,
        });
        if (error instanceof ScheduledTaskCancellationIoTimeoutError) break;
      }
      if (!cancellationRun && attempt < 2) await resolved.wait(200);
    }
  }
  if (!cancellationRun) {
    if (exactAbsenceObserved) {
      journal =
        (await resolved.updateJournal(journal.taskId, journal.requestId, {
          cancellationAbsenceObservations: Math.min(
            journal.cancellationAbsenceObservations + 1,
            10_000,
          ),
        })) ?? journal;
    }
    const possibleDispatchAt = journal.dispatchStartedAt ?? journal.createdAt;
    if (
      exactAbsenceObserved &&
      journal.cancellationAbsenceObservations >= DISPATCH_ABSENCE_MIN_OBSERVATIONS &&
      attemptedAt - possibleDispatchAt >= DISPATCH_ABSENCE_GRACE_MS
    ) {
      await resolved.removeJournal(journal.taskId, journal.requestId);
      return true;
    }
    return false;
  }

  journal =
    (await resolved.updateJournal(journal.taskId, journal.requestId, {
      cloudRun: cancellationRun,
      cancellationPending: true,
    })) ?? journal;
  if (isScheduledRunCancellationSettled(cancellationRun)) {
    await resolved.removeJournal(journal.taskId, journal.requestId);
    return true;
  }

  let cancellation;
  try {
    cancellation = await runBoundedCancellationIo(
      (signal) =>
        resolved.cancelRun(
          cancellationRun,
          {
            getAuthToken: async () => credential.token,
          },
          signal,
        ),
      resolved.ioTimeoutMs,
    );
  } catch (error) {
    resolved.warn('Scheduled Managed Cloud cancellation request failed', {
      taskId: journal.taskId,
      runId: cancellationRun.runId,
      error,
    });
    return false;
  }
  if (cancellation.status === 'error') {
    resolved.warn('Scheduled Managed Cloud cancellation was not acknowledged', {
      taskId: journal.taskId,
      runId: cancellationRun.runId,
      error: cancellation.message,
    });
    return false;
  }

  const acknowledgedRun: ManagedCloudAgentRunReference = {
    runId: cancellation.run.id,
    runPath: cancellationRun.runPath,
    lastSequence: cancellationRun.lastSequence,
    state: cancellation.run.state,
    cancellationRequestedAt: cancellation.run.cancellationRequestedAt,
  };
  await resolved.updateJournal(journal.taskId, journal.requestId, {
    cloudRun: acknowledgedRun,
    cancellationPending: true,
  });
  if (!isScheduledRunCancellationSettled(acknowledgedRun)) return false;
  await resolved.removeJournal(journal.taskId, journal.requestId);
  return true;
}
