export class RetryAbortedError extends Error {
  constructor(message = 'Aborted') {
    super(message);
    this.name = 'AbortError';
    Object.setPrototypeOf(this, RetryAbortedError.prototype);
  }
}

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new RetryAbortedError());
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new RetryAbortedError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export type RetryDisposition = 'retry' | 'retry-only-if-idempotent' | 'terminal';

export interface RetryClassification {
  disposition: RetryDisposition;
  reason: string;
  retryAfterMs?: number;
}

export type RetryTelemetryEvent =
  | { type: 'attempt'; attempt: number; operation: string }
  | { type: 'succeeded'; attempt: number; operation: string }
  | {
      type: 'scheduled';
      attempt: number;
      operation: string;
      delayMs: number;
      classification: RetryClassification;
      error: unknown;
    }
  | {
      type: 'stopped';
      attempt: number;
      operation: string;
      reason: RetryStopReason;
      classification: RetryClassification;
      error: unknown;
    };

export type RetryStopReason =
  | 'terminal'
  | 'not-idempotent'
  | 'attempts-exhausted'
  | 'budget-exhausted'
  | 'aborted';

export class RetryStoppedError extends Error {
  constructor(
    readonly reason: RetryStopReason,
    readonly attempts: number,
    readonly lastError: unknown,
    readonly classification: RetryClassification,
  ) {
    super(
      `retry stopped after ${attempts} attempt${attempts === 1 ? '' : 's'} (${reason}): ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`,
    );
    this.name = 'RetryStoppedError';
    Object.setPrototypeOf(this, RetryStoppedError.prototype);
  }
}

export interface RetryBudget {
  tryConsume(): boolean;
  refund(): void;
}

/**
 * Token bucket shared by every call that names the same budget. A retry storm
 * spends the bucket faster than it refills, so the surface degrades to
 * single-attempt calls instead of multiplying load against a failing dependency.
 */
export function createRetryBudget(config: {
  capacity: number;
  refillPerSecond: number;
  now?: () => number;
}): RetryBudget {
  const capacity = Math.max(1, config.capacity);
  const refillPerSecond = Math.max(0, config.refillPerSecond);
  const now = config.now ?? Date.now;
  let tokens = capacity;
  let updatedAt = now();

  function refill(): void {
    const at = now();
    const elapsedSeconds = Math.max(0, at - updatedAt) / 1000;
    if (elapsedSeconds <= 0) return;
    tokens = Math.min(capacity, tokens + elapsedSeconds * refillPerSecond);
    updatedAt = at;
  }

  return {
    tryConsume(): boolean {
      refill();
      if (tokens < 1) return false;
      tokens -= 1;
      return true;
    },
    refund(): void {
      refill();
      tokens = Math.min(capacity, tokens + 1);
    },
  };
}

const NAMED_BUDGETS = new Map<string, RetryBudget>();

export function retryBudgetFor(
  name: string,
  config?: { capacity: number; refillPerSecond: number },
): RetryBudget {
  const existing = NAMED_BUDGETS.get(name);
  if (existing) return existing;
  const created = createRetryBudget(config ?? { capacity: 100, refillPerSecond: 10 });
  NAMED_BUDGETS.set(name, created);
  return created;
}

export function resetRetryBudgets(): void {
  NAMED_BUDGETS.clear();
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

const NEVER_SENT_PATTERNS =
  /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH|getaddrinfo|dns lookup failed/i;

const MAYBE_APPLIED_PATTERNS =
  /ECONNRESET|EPIPE|ETIMEDOUT|socket hang up|network error|fetch failed|premature close|terminated/i;

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function readStatus(error: unknown): number | undefined {
  const source = error as
    | { status?: unknown; statusCode?: unknown; response?: { status?: unknown } }
    | undefined;
  return (
    readNumber(source?.status) ??
    readNumber(source?.statusCode) ??
    readNumber(source?.response?.status)
  );
}

export function readRetryAfterMs(error: unknown, now = Date.now()): number | undefined {
  const source = error as
    | {
        retryAfterMs?: unknown;
        retryAfterSeconds?: unknown;
        headers?: { get?: (name: string) => string | null } | Record<string, unknown>;
        response?: { headers?: { get?: (name: string) => string | null } };
      }
    | undefined;

  const direct = readNumber(source?.retryAfterMs);
  if (direct !== undefined) return Math.max(0, direct);

  const seconds = readNumber(source?.retryAfterSeconds);
  if (seconds !== undefined) return Math.max(0, seconds * 1000);

  const headers = source?.response?.headers ?? source?.headers;
  let raw: string | null | undefined;
  if (headers && typeof (headers as { get?: unknown }).get === 'function') {
    raw = (headers as { get: (name: string) => string | null }).get('retry-after');
  } else if (headers && typeof headers === 'object') {
    const record = headers as Record<string, unknown>;
    const value = record['retry-after'] ?? record['Retry-After'];
    raw = typeof value === 'string' ? value : undefined;
  }
  if (raw == null) return undefined;

  const asSeconds = Number(raw);
  if (Number.isFinite(asSeconds)) return Math.max(0, asSeconds * 1000);

  const asDate = Date.parse(raw);
  if (Number.isFinite(asDate)) return Math.max(0, asDate - now);
  return undefined;
}

export function classifyRetryError(error: unknown): RetryClassification {
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
    return { disposition: 'terminal', reason: 'aborted' };
  }

  const status = readStatus(error);
  if (status !== undefined) {
    const retryAfterMs = readRetryAfterMs(error);
    if (RETRYABLE_STATUS.has(status)) {
      // A rejected request was never applied, so retrying it cannot duplicate
      // a side effect even when the caller is not idempotent.
      const disposition: RetryDisposition =
        status === 429 || status === 503 ? 'retry' : 'retry-only-if-idempotent';
      const classification: RetryClassification = {
        disposition,
        reason: `http_${status}`,
      };
      if (retryAfterMs !== undefined) classification.retryAfterMs = retryAfterMs;
      return classification;
    }
    return { disposition: 'terminal', reason: `http_${status}` };
  }

  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const code =
    typeof (error as { code?: unknown })?.code === 'string'
      ? String((error as { code: string }).code)
      : '';
  const haystack = `${code} ${message}`;

  if (NEVER_SENT_PATTERNS.test(haystack)) {
    return { disposition: 'retry', reason: 'connection_never_established' };
  }
  if (MAYBE_APPLIED_PATTERNS.test(haystack)) {
    return { disposition: 'retry-only-if-idempotent', reason: 'connection_lost_in_flight' };
  }
  return { disposition: 'terminal', reason: 'unclassified' };
}

export interface RetryPolicy {
  operation?: string;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  multiplier?: number;
  jitter?: 'full' | 'equal' | 'none';
  maxRetryAfterMs?: number;
  idempotent?: boolean;
  budget?: RetryBudget;
  signal?: AbortSignal;
  classify?: (error: unknown, attempt: number) => RetryClassification | undefined;
  onEvent?: (event: RetryTelemetryEvent) => void;
  random?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export const RETRY_POLICY_DEFAULTS = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 30_000,
  multiplier: 2,
  jitter: 'full' as const,
  maxRetryAfterMs: 120_000,
  idempotent: true,
};

export function computeRetryDelayMs(
  attempt: number,
  policy: Pick<RetryPolicy, 'baseDelayMs' | 'maxDelayMs' | 'multiplier' | 'jitter' | 'random'>,
  retryAfterMs?: number,
  maxRetryAfterMs = RETRY_POLICY_DEFAULTS.maxRetryAfterMs,
): number {
  if (retryAfterMs !== undefined) {
    return Math.min(Math.max(0, Math.round(retryAfterMs)), maxRetryAfterMs);
  }
  const base = policy.baseDelayMs ?? RETRY_POLICY_DEFAULTS.baseDelayMs;
  const max = policy.maxDelayMs ?? RETRY_POLICY_DEFAULTS.maxDelayMs;
  const multiplier = policy.multiplier ?? RETRY_POLICY_DEFAULTS.multiplier;
  const jitter = policy.jitter ?? RETRY_POLICY_DEFAULTS.jitter;
  const random = policy.random ?? Math.random;
  const capped = Math.min(base * Math.pow(multiplier, Math.max(0, attempt - 1)), max);
  if (jitter === 'none') return Math.round(capped);
  if (jitter === 'equal') return Math.round(capped / 2 + random() * (capped / 2));
  return Math.round(random() * capped);
}

export async function runWithRetryPolicy<T>(
  operation: () => Promise<T>,
  policy: RetryPolicy = {},
): Promise<T> {
  const name = policy.operation ?? 'anonymous';
  const maxAttempts = Math.max(1, policy.maxAttempts ?? RETRY_POLICY_DEFAULTS.maxAttempts);
  const idempotent = policy.idempotent ?? RETRY_POLICY_DEFAULTS.idempotent;
  const maxRetryAfterMs = policy.maxRetryAfterMs ?? RETRY_POLICY_DEFAULTS.maxRetryAfterMs;
  const emit = policy.onEvent ?? (() => {});
  const doSleep = policy.sleep ?? abortableSleep;

  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt += 1;
    if (policy.signal?.aborted) {
      const classification: RetryClassification = { disposition: 'terminal', reason: 'aborted' };
      const aborted = new RetryAbortedError();
      emit({
        type: 'stopped',
        attempt,
        operation: name,
        reason: 'aborted',
        classification,
        error: aborted,
      });
      throw new RetryStoppedError('aborted', attempt, aborted, classification);
    }

    emit({ type: 'attempt', attempt, operation: name });
    try {
      const result = await operation();
      emit({ type: 'succeeded', attempt, operation: name });
      return result;
    } catch (error) {
      const classification = policy.classify?.(error, attempt) ?? classifyRetryError(error);

      const stop = (reason: RetryStopReason): never => {
        emit({ type: 'stopped', attempt, operation: name, reason, classification, error });
        throw new RetryStoppedError(reason, attempt, error, classification);
      };

      if (classification.disposition === 'terminal') stop('terminal');
      if (classification.disposition === 'retry-only-if-idempotent' && !idempotent) {
        stop('not-idempotent');
      }
      if (attempt >= maxAttempts) stop('attempts-exhausted');
      if (policy.budget && !policy.budget.tryConsume()) stop('budget-exhausted');

      const delayMs = computeRetryDelayMs(
        attempt,
        policy,
        classification.retryAfterMs,
        maxRetryAfterMs,
      );
      emit({ type: 'scheduled', attempt, operation: name, delayMs, classification, error });

      try {
        await doSleep(delayMs, policy.signal);
      } catch (sleepError) {
        const abortedClassification: RetryClassification = {
          disposition: 'terminal',
          reason: 'aborted',
        };
        emit({
          type: 'stopped',
          attempt,
          operation: name,
          reason: 'aborted',
          classification: abortedClassification,
          error: sleepError,
        });
        throw new RetryStoppedError('aborted', attempt, sleepError, abortedClassification);
      }
    }
  }

  const exhausted: RetryClassification = { disposition: 'terminal', reason: 'unreachable' };
  throw new RetryStoppedError(
    'attempts-exhausted',
    attempt,
    new Error('retry loop exited'),
    exhausted,
  );
}
