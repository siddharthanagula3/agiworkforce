export const SOURCE_BUDGET_WINDOW_MS = 60 * 60 * 1000;
export const JOB_RETENTION_MS = 60 * 60 * 1000;
export const MIN_RETRY_AFTER_SECONDS = 60;
const MAX_RETAINED_JOBS = 1000;

export type BudgetAnswer = { admitted: true } | { admitted: false; retryAfterSeconds: number };

export interface SourceBudget {
  admit: (bytes: number) => BudgetAnswer;
}

export interface SourceBudgetOptions {
  bytesPerHour: number;
  startedAt: number;
  now: () => number;
}

export type ScanJobStatus = 'queued' | 'scanning' | 'done';

export interface ScanJob<V> {
  id: string;
  byteCount: number;
  deadlineMs: number;
  status: ScanJobStatus;
  verdict?: V;
}

export type Submission<V> =
  | { kind: 'accepted'; job: ScanJob<V>; repeated: boolean }
  | { kind: 'refused'; reason: 'queue_full' | 'source_budget'; retryAfterSeconds: number };

export interface ScanQueueOptions {
  concurrency: number;
  queueMax: number;
  budget: SourceBudget;
  now: () => number;
}

export interface ScanQueue<P, V> {
  submit: (id: string, byteCount: number, deadlineMs: number, payload: P) => Submission<V>;
  get: (id: string) => ScanJob<V> | undefined;
  depth: () => number;
  running: () => number;
}

function retryAfterSeconds(waitMs: number): number {
  return Math.max(MIN_RETRY_AFTER_SECONDS, Math.ceil(waitMs / 1000));
}

export function createSourceBudget(options: SourceBudgetOptions): SourceBudget {
  const admitted: Array<{ at: number; bytes: number }> = [];

  const allowanceAt = (at: number) =>
    options.bytesPerHour *
    Math.min(1, Math.max(0, at - options.startedAt) / SOURCE_BUDGET_WINDOW_MS);

  const waitMs = (at: number, bytes: number): number => {
    let used = admitted.reduce((total, entry) => total + entry.bytes, 0);
    let segmentStart = at;
    for (let index = 0; index <= admitted.length; index += 1) {
      const next = admitted[index];
      const segmentEnd = next ? next.at + SOURCE_BUDGET_WINDOW_MS : Number.POSITIVE_INFINITY;
      const needed = used + bytes;
      if (needed <= options.bytesPerHour) {
        const rampedAt =
          options.startedAt + (SOURCE_BUDGET_WINDOW_MS * needed) / options.bytesPerHour;
        const admissibleAt = Math.max(segmentStart, rampedAt);
        if (admissibleAt < segmentEnd) return admissibleAt - at;
      }
      if (next) used -= next.bytes;
      segmentStart = segmentEnd;
    }
    return SOURCE_BUDGET_WINDOW_MS;
  };

  return {
    admit: (bytes) => {
      const at = options.now();
      for (let oldest = admitted[0]; oldest && oldest.at + SOURCE_BUDGET_WINDOW_MS <= at;) {
        admitted.shift();
        oldest = admitted[0];
      }
      const used = admitted.reduce((total, entry) => total + entry.bytes, 0);
      if (used + bytes <= allowanceAt(at)) {
        admitted.push({ at, bytes });
        return { admitted: true };
      }
      return { admitted: false, retryAfterSeconds: retryAfterSeconds(waitMs(at, bytes)) };
    },
  };
}

interface Entry<P, V> {
  job: ScanJob<V>;
  payload: P | null;
  finishedAt: number | null;
}

export function createScanQueue<P, V>(
  options: ScanQueueOptions,
  run: (payload: P) => Promise<V>,
  onFailure: (error: unknown, payload: P) => V,
): ScanQueue<P, V> {
  const entries = new Map<string, Entry<P, V>>();
  const waiting: Array<Entry<P, V>> = [];
  let active = 0;

  const forget = () => {
    const at = options.now();
    let done = 0;
    for (const [id, entry] of entries) {
      if (entry.finishedAt === null) continue;
      if (entry.finishedAt + JOB_RETENTION_MS <= at) entries.delete(id);
      else done += 1;
    }
    for (const [id, entry] of entries) {
      if (done <= MAX_RETAINED_JOBS) break;
      if (entry.finishedAt === null) continue;
      entries.delete(id);
      done -= 1;
    }
  };

  const start = (entry: Entry<P, V>) => {
    const payload = entry.payload as P;
    entry.payload = null;
    entry.job.status = 'scanning';
    active += 1;
    let running: Promise<V>;
    try {
      running = run(payload);
    } catch (error) {
      running = Promise.reject(error);
    }
    void running
      .catch((error: unknown) => onFailure(error, payload))
      .then((verdict) => {
        entry.job.status = 'done';
        entry.job.verdict = verdict;
        entry.finishedAt = options.now();
        active -= 1;
        const next = waiting.shift();
        if (next) start(next);
      });
  };

  const snapshot = (job: ScanJob<V>): ScanJob<V> => ({ ...job });

  return {
    submit: (id, byteCount, deadlineMs, payload) => {
      forget();
      const existing = entries.get(id);
      if (existing) return { kind: 'accepted', job: snapshot(existing.job), repeated: true };
      if (active >= options.concurrency && waiting.length >= options.queueMax) {
        return {
          kind: 'refused',
          reason: 'queue_full',
          retryAfterSeconds: MIN_RETRY_AFTER_SECONDS,
        };
      }
      const budget = options.budget.admit(byteCount);
      if (!budget.admitted) {
        return {
          kind: 'refused',
          reason: 'source_budget',
          retryAfterSeconds: budget.retryAfterSeconds,
        };
      }
      const entry: Entry<P, V> = {
        job: { id, byteCount, deadlineMs, status: 'queued' },
        payload,
        finishedAt: null,
      };
      entries.set(id, entry);
      if (active < options.concurrency) start(entry);
      else waiting.push(entry);
      return { kind: 'accepted', job: snapshot(entry.job), repeated: false };
    },
    get: (id) => {
      forget();
      const entry = entries.get(id);
      return entry ? snapshot(entry.job) : undefined;
    },
    depth: () => waiting.length,
    running: () => active,
  };
}
