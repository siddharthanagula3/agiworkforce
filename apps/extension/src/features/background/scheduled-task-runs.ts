import { ManagedCloudAgentRunReferenceSchema } from '@agiworkforce/cloud-contracts';
import type { ManagedCloudAgentRunReference } from '@agiworkforce/cloud-contracts';
import type { ChromeManagedRoutingMetadata } from '../../types';
import { normalizeChromeManagedRoutingMetadata } from '../cloud-bridge/managedChatHandler';
import {
  normalizeManagedCloudOwner,
  sameManagedCloudOwner,
  type ManagedCloudOwner,
} from '../cloud-bridge/managedCloudAuthority';

const STORAGE_KEY = 'agi_scheduled_task_runs_v1';
const MAX_RUNS = 50;
const ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
const MAX_LABEL_CHARS = 200;
const MAX_PROMPT_CHARS = 10_000;

export interface ScheduledTaskRunJournal {
  version: 1;
  taskId: string;
  taskName: string;
  prompt: string;
  requestId: string;
  owner: ManagedCloudOwner;
  createdAt: number;
  updatedAt: number;
  recoveryAttempts: number;
  /** Durable tombstone: recovery may cancel this request but must never resume it. */
  cancellationPending: boolean;
  cancellationAttempts: number;
  /** Successful tenant-scoped request-id lookups that returned no server run. */
  cancellationAbsenceObservations: number;
  cancellationRequestedAt?: number;
  cancellationLastAttemptAt?: number;
  /** Present on journals created after pre-dispatch absence tracking shipped. */
  dispatchPreparedAt?: number;
  /** Written immediately before the request is handed to Managed Cloud. */
  dispatchStartedAt?: number;
  cloudRun?: ManagedCloudAgentRunReference;
  routing?: ChromeManagedRoutingMetadata;
}

interface ScheduledTaskRunStore {
  version: 1;
  runs: ScheduledTaskRunJournal[];
}

let mutationQueue: Promise<void> = Promise.resolve();

function emptyStore(): ScheduledTaskRunStore {
  return { version: 1, runs: [] };
}

function boundedText(value: unknown, maximum: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized && normalized.length <= maximum ? normalized : undefined;
}

function normalizeRouting(value: unknown): ChromeManagedRoutingMetadata | undefined {
  return normalizeChromeManagedRoutingMetadata(value) ?? undefined;
}

function normalizeJournal(value: unknown): ScheduledTaskRunJournal | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const taskId = boundedText(record['taskId'], 128);
  const taskName = boundedText(record['taskName'], MAX_LABEL_CHARS);
  const prompt = boundedText(record['prompt'], MAX_PROMPT_CHARS);
  const requestId = boundedText(record['requestId'], 128);
  const owner = normalizeManagedCloudOwner(record['owner']);
  const createdAt = record['createdAt'];
  const updatedAt = record['updatedAt'];
  const recoveryAttempts = record['recoveryAttempts'];
  const cancellationPending = record['cancellationPending'] ?? false;
  const cancellationAttempts = record['cancellationAttempts'] ?? 0;
  const cancellationAbsenceObservations = record['cancellationAbsenceObservations'] ?? 0;
  const cancellationRequestedAt = record['cancellationRequestedAt'];
  const cancellationLastAttemptAt = record['cancellationLastAttemptAt'];
  const dispatchPreparedAt = record['dispatchPreparedAt'];
  const dispatchStartedAt = record['dispatchStartedAt'];
  if (
    record['version'] !== 1 ||
    !taskId ||
    !ID_PATTERN.test(taskId) ||
    !taskName ||
    !prompt ||
    !requestId ||
    !REQUEST_ID_PATTERN.test(requestId) ||
    !owner ||
    typeof createdAt !== 'number' ||
    !Number.isFinite(createdAt) ||
    typeof updatedAt !== 'number' ||
    !Number.isFinite(updatedAt) ||
    typeof recoveryAttempts !== 'number' ||
    !Number.isInteger(recoveryAttempts) ||
    recoveryAttempts < 0 ||
    recoveryAttempts > 10 ||
    typeof cancellationPending !== 'boolean' ||
    typeof cancellationAttempts !== 'number' ||
    !Number.isInteger(cancellationAttempts) ||
    cancellationAttempts < 0 ||
    cancellationAttempts > 10_000 ||
    typeof cancellationAbsenceObservations !== 'number' ||
    !Number.isInteger(cancellationAbsenceObservations) ||
    cancellationAbsenceObservations < 0 ||
    cancellationAbsenceObservations > 10_000 ||
    (cancellationRequestedAt !== undefined &&
      (typeof cancellationRequestedAt !== 'number' || !Number.isFinite(cancellationRequestedAt))) ||
    (cancellationLastAttemptAt !== undefined &&
      (typeof cancellationLastAttemptAt !== 'number' ||
        !Number.isFinite(cancellationLastAttemptAt))) ||
    (dispatchPreparedAt !== undefined &&
      (typeof dispatchPreparedAt !== 'number' || !Number.isFinite(dispatchPreparedAt))) ||
    (dispatchStartedAt !== undefined &&
      (typeof dispatchStartedAt !== 'number' || !Number.isFinite(dispatchStartedAt)))
  ) {
    return undefined;
  }

  const parsedRun = ManagedCloudAgentRunReferenceSchema.safeParse(record['cloudRun']);
  const routing = normalizeRouting(record['routing']);
  return {
    version: 1,
    taskId,
    taskName,
    prompt,
    requestId,
    owner,
    createdAt,
    updatedAt,
    recoveryAttempts,
    cancellationPending,
    cancellationAttempts,
    cancellationAbsenceObservations,
    ...(typeof cancellationRequestedAt === 'number' ? { cancellationRequestedAt } : {}),
    ...(typeof cancellationLastAttemptAt === 'number' ? { cancellationLastAttemptAt } : {}),
    ...(typeof dispatchPreparedAt === 'number' ? { dispatchPreparedAt } : {}),
    ...(typeof dispatchStartedAt === 'number' ? { dispatchStartedAt } : {}),
    ...(parsedRun.success ? { cloudRun: parsedRun.data } : {}),
    ...(routing ? { routing } : {}),
  };
}

async function readStore(): Promise<ScheduledTaskRunStore> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const value = stored[STORAGE_KEY];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyStore();
  const record = value as Record<string, unknown>;
  if (record['version'] !== 1 || !Array.isArray(record['runs'])) return emptyStore();
  return {
    version: 1,
    runs: record['runs']
      .slice(0, MAX_RUNS * 2)
      .flatMap((run) => {
        const normalized = normalizeJournal(run);
        return normalized ? [normalized] : [];
      })
      .slice(0, MAX_RUNS),
  };
}

async function writeStore(store: ScheduledTaskRunStore): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: store });
}

function mutate<T>(operation: (store: ScheduledTaskRunStore) => Promise<T>): Promise<T> {
  const result = mutationQueue.then(async () => operation(await readStore()));
  mutationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export async function loadScheduledTaskRunJournals(): Promise<ScheduledTaskRunJournal[]> {
  return (await readStore()).runs;
}

/** Exact recovery identity: owner incarnation, prompt, and cancellation state. */
export function canResumeScheduledTaskRunJournal(
  journal: ScheduledTaskRunJournal,
  owner: ManagedCloudOwner,
  prompt: string,
): boolean {
  return (
    sameManagedCloudOwner(journal.owner, owner) &&
    !journal.cancellationPending &&
    journal.prompt === prompt
  );
}

export async function beginScheduledTaskRunJournal(
  input: Omit<
    ScheduledTaskRunJournal,
    | 'version'
    | 'createdAt'
    | 'updatedAt'
    | 'recoveryAttempts'
    | 'cancellationPending'
    | 'cancellationAttempts'
    | 'cancellationAbsenceObservations'
    | 'cancellationRequestedAt'
    | 'cancellationLastAttemptAt'
    | 'dispatchPreparedAt'
    | 'dispatchStartedAt'
  >,
  now = Date.now(),
): Promise<{ journal: ScheduledTaskRunJournal; created: boolean }> {
  return mutate(async (store) => {
    const existing = store.runs.find((run) => run.taskId === input.taskId);
    if (existing) return { journal: existing, created: false };
    const normalized = normalizeJournal({
      ...input,
      version: 1,
      createdAt: now,
      updatedAt: now,
      recoveryAttempts: 0,
      cancellationPending: false,
      cancellationAttempts: 0,
      cancellationAbsenceObservations: 0,
      dispatchPreparedAt: now,
    });
    if (!normalized) throw new Error('Scheduled task run journal input is invalid.');
    if (store.runs.length >= MAX_RUNS) {
      throw new Error('Too many scheduled task runs are awaiting recovery.');
    }
    store.runs.push(normalized);
    await writeStore(store);
    return { journal: normalized, created: true };
  });
}

export async function updateScheduledTaskRunJournal(
  taskId: string,
  requestId: string,
  patch: Pick<ScheduledTaskRunJournal, 'cloudRun' | 'routing'> & {
    recoveryAttempts?: number;
    cancellationPending?: boolean;
    cancellationAttempts?: number;
    cancellationAbsenceObservations?: number;
    cancellationRequestedAt?: number;
    cancellationLastAttemptAt?: number;
    dispatchStartedAt?: number;
  },
): Promise<ScheduledTaskRunJournal | undefined> {
  return mutate(async (store) => {
    const index = store.runs.findIndex(
      (run) => run.taskId === taskId && run.requestId === requestId,
    );
    const current = store.runs[index];
    if (!current) return undefined;
    const normalized = normalizeJournal({
      ...current,
      ...(patch.cloudRun ? { cloudRun: patch.cloudRun } : {}),
      ...(patch.routing ? { routing: patch.routing } : {}),
      ...(patch.recoveryAttempts === undefined ? {} : { recoveryAttempts: patch.recoveryAttempts }),
      ...(patch.cancellationPending === undefined
        ? {}
        : { cancellationPending: patch.cancellationPending }),
      ...(patch.cancellationAttempts === undefined
        ? {}
        : { cancellationAttempts: patch.cancellationAttempts }),
      ...(patch.cancellationAbsenceObservations === undefined
        ? {}
        : { cancellationAbsenceObservations: patch.cancellationAbsenceObservations }),
      ...(patch.cancellationRequestedAt === undefined
        ? {}
        : { cancellationRequestedAt: patch.cancellationRequestedAt }),
      ...(patch.cancellationLastAttemptAt === undefined
        ? {}
        : { cancellationLastAttemptAt: patch.cancellationLastAttemptAt }),
      ...(patch.dispatchStartedAt === undefined
        ? {}
        : { dispatchStartedAt: patch.dispatchStartedAt }),
      updatedAt: Date.now(),
    });
    if (!normalized) throw new Error('Scheduled task run journal update is invalid.');
    store.runs[index] = normalized;
    await writeStore(store);
    return normalized;
  });
}

export async function removeScheduledTaskRunJournal(
  taskId: string,
  requestId: string,
): Promise<boolean> {
  return mutate(async (store) => {
    const next = store.runs.filter((run) => run.taskId !== taskId || run.requestId !== requestId);
    if (next.length === store.runs.length) return false;
    store.runs = next;
    await writeStore(store);
    return true;
  });
}

export const SCHEDULED_TASK_RUN_STORAGE_KEY = STORAGE_KEY;
