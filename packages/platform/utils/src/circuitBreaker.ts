export type CircuitState = 'closed' | 'open' | 'half_open';

export type DependencyRejectionReason = 'open' | 'overloaded' | 'timeout' | 'error';

export class CircuitOpenError extends Error {
  override readonly name = 'CircuitOpenError';
  constructor(
    readonly dependency: string,
    readonly retryAfterMs: number,
  ) {
    super(`Dependency "${dependency}" is unavailable (circuit open)`);
    Object.setPrototypeOf(this, CircuitOpenError.prototype);
  }
}

export class DependencyTimeoutError extends Error {
  override readonly name = 'DependencyTimeoutError';
  constructor(
    readonly dependency: string,
    readonly timeoutMs: number,
  ) {
    super(`Dependency "${dependency}" did not respond within ${timeoutMs}ms`);
    Object.setPrototypeOf(this, DependencyTimeoutError.prototype);
  }
}

export class DependencyOverloadedError extends Error {
  override readonly name = 'DependencyOverloadedError';
  constructor(
    readonly dependency: string,
    readonly maxConcurrent: number,
    readonly maxQueued: number,
  ) {
    super(
      `Dependency "${dependency}" is at capacity (${maxConcurrent} in flight, ${maxQueued} queued)`,
    );
    Object.setPrototypeOf(this, DependencyOverloadedError.prototype);
  }
}

export function isDependencyUnavailableError(error: unknown): boolean {
  return (
    error instanceof CircuitOpenError ||
    error instanceof DependencyTimeoutError ||
    error instanceof DependencyOverloadedError
  );
}

export interface CircuitStateChange {
  name: string;
  from: CircuitState;
  to: CircuitState;
  failureRate: number;
  slowCallRate: number;
  samples: number;
  openMs: number;
  lastError: string | null;
}

export interface CircuitBreakerOptions {
  name: string;
  timeoutMs?: number;
  maxConcurrent?: number;
  maxQueued?: number;
  queueTimeoutMs?: number;
  slowCallMs?: number;
  windowMs?: number;
  bucketCount?: number;
  volumeThreshold?: number;
  failureRateThreshold?: number;
  slowCallRateThreshold?: number;
  openMs?: number;
  maxOpenMs?: number;
  halfOpenMaxCalls?: number;
  halfOpenSuccessesToClose?: number;
  isFailure?: (error: unknown) => boolean;
  now?: () => number;
  onStateChange?: (event: CircuitStateChange) => void;
}

export interface DependencyRejection {
  dependency: string;
  reason: DependencyRejectionReason;
  error: unknown;
  state: CircuitState;
}

export interface ExecuteOptions<T> {
  signal?: AbortSignal;
  timeoutMs?: number;
  fallback?: (rejection: DependencyRejection) => T | Promise<T>;
}

export interface LeaseOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * A slot held across a long-lived call (an LLM stream, a websocket turn) where
 * `execute` does not fit. `timeoutMs` bounds time-to-first-outcome, not the whole
 * call: the deadline is cleared by `succeeded`/`failed`, so a stream that starts
 * promptly may run as long as its own lifecycle allows while still occupying one
 * unit of the dependency's concurrency budget until `release`.
 */
export interface CircuitLease {
  readonly signal: AbortSignal;
  succeeded(): void;
  failed(error: unknown): void;
  release(): void;
}

export interface CircuitBreakerSnapshot {
  name: string;
  state: CircuitState;
  healthy: boolean;
  samples: number;
  failureRate: number;
  slowCallRate: number;
  inFlight: number;
  queued: number;
  maxConcurrent: number;
  retryAfterMs: number | null;
  openedAt: number | null;
  consecutiveTrips: number;
  lastError: string | null;
  totals: {
    calls: number;
    successes: number;
    failures: number;
    timeouts: number;
    slow: number;
    shortCircuited: number;
    shed: number;
    fallbacks: number;
  };
}

interface Bucket {
  start: number;
  total: number;
  failures: number;
  slow: number;
}

interface Waiter {
  resolve: () => void;
  reject: (error: unknown) => void;
  timer: ReturnType<typeof setTimeout> | null;
  settled: boolean;
}

const DEFAULTS = {
  timeoutMs: 10_000,
  maxConcurrent: 16,
  maxQueued: 32,
  queueTimeoutMs: 2_000,
  windowMs: 30_000,
  bucketCount: 6,
  volumeThreshold: 10,
  failureRateThreshold: 0.5,
  slowCallRateThreshold: 0.8,
  openMs: 15_000,
  maxOpenMs: 120_000,
  halfOpenMaxCalls: 2,
  halfOpenSuccessesToClose: 2,
} as const;

function unref(timer: ReturnType<typeof setTimeout>): ReturnType<typeof setTimeout> {
  (timer as unknown as { unref?: () => void }).unref?.();
  return timer;
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export class CircuitBreaker {
  readonly name: string;
  private readonly timeoutMs: number;
  private readonly maxConcurrent: number;
  private readonly maxQueued: number;
  private readonly queueTimeoutMs: number;
  private readonly slowCallMs: number;
  private readonly windowMs: number;
  private readonly bucketCount: number;
  private readonly volumeThreshold: number;
  private readonly failureRateThreshold: number;
  private readonly slowCallRateThreshold: number;
  private readonly baseOpenMs: number;
  private readonly maxOpenMs: number;
  private readonly halfOpenMaxCalls: number;
  private readonly halfOpenSuccessesToClose: number;
  private readonly isFailure: (error: unknown) => boolean;
  private readonly now: () => number;
  private readonly onStateChange: ((event: CircuitStateChange) => void) | undefined;

  private state: CircuitState = 'closed';
  private buckets: Bucket[] = [];
  private openedAt: number | null = null;
  private currentOpenMs: number;
  private consecutiveTrips = 0;
  private halfOpenInFlight = 0;
  private halfOpenSuccesses = 0;
  private inFlight = 0;
  private readonly waiters: Waiter[] = [];
  private lastError: string | null = null;

  private totals = {
    calls: 0,
    successes: 0,
    failures: 0,
    timeouts: 0,
    slow: 0,
    shortCircuited: 0,
    shed: 0,
    fallbacks: 0,
  };

  constructor(options: CircuitBreakerOptions) {
    this.name = options.name;
    this.timeoutMs = options.timeoutMs ?? DEFAULTS.timeoutMs;
    this.maxConcurrent = Math.max(1, options.maxConcurrent ?? DEFAULTS.maxConcurrent);
    this.maxQueued = Math.max(0, options.maxQueued ?? DEFAULTS.maxQueued);
    this.queueTimeoutMs = options.queueTimeoutMs ?? DEFAULTS.queueTimeoutMs;
    this.slowCallMs = options.slowCallMs ?? Math.floor(this.timeoutMs / 2);
    this.windowMs = options.windowMs ?? DEFAULTS.windowMs;
    this.bucketCount = Math.max(1, options.bucketCount ?? DEFAULTS.bucketCount);
    this.volumeThreshold = Math.max(1, options.volumeThreshold ?? DEFAULTS.volumeThreshold);
    this.failureRateThreshold = options.failureRateThreshold ?? DEFAULTS.failureRateThreshold;
    this.slowCallRateThreshold = options.slowCallRateThreshold ?? DEFAULTS.slowCallRateThreshold;
    this.baseOpenMs = options.openMs ?? DEFAULTS.openMs;
    this.maxOpenMs = Math.max(this.baseOpenMs, options.maxOpenMs ?? DEFAULTS.maxOpenMs);
    this.halfOpenMaxCalls = Math.max(1, options.halfOpenMaxCalls ?? DEFAULTS.halfOpenMaxCalls);
    this.halfOpenSuccessesToClose = Math.max(
      1,
      options.halfOpenSuccessesToClose ?? DEFAULTS.halfOpenSuccessesToClose,
    );
    this.isFailure = options.isFailure ?? (() => true);
    this.now = options.now ?? Date.now;
    this.onStateChange = options.onStateChange;
    this.currentOpenMs = this.baseOpenMs;
  }

  async execute<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    options: ExecuteOptions<T> = {},
  ): Promise<T> {
    try {
      return await this.run(operation, options);
    } catch (error) {
      if (!options.fallback) throw error;
      this.totals.fallbacks += 1;
      return options.fallback({
        dependency: this.name,
        reason: this.rejectionReason(error),
        error,
        state: this.state,
      });
    }
  }

  async begin(options: LeaseOptions = {}): Promise<CircuitLease> {
    const probing = this.admit();
    try {
      await this.acquire(probing, options.signal);
    } catch (error) {
      if (probing) this.halfOpenInFlight -= 1;
      throw error;
    }

    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    const startedAt = this.now();
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort(options.signal?.reason);
    if (options.signal) {
      if (options.signal.aborted) controller.abort(options.signal.reason);
      else options.signal.addEventListener('abort', abortFromCaller, { once: true });
    }

    let succeededAt: number | null = null;
    let finalized = false;
    let released = false;
    const timer = unref(
      setTimeout(() => {
        if (succeededAt !== null || finalized) return;
        controller.abort(new DependencyTimeoutError(this.name, timeoutMs));
      }, timeoutMs),
    );

    const stopDeadline = () => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abortFromCaller);
    };

    const release = (): void => {
      if (succeededAt === null && !finalized) {
        finalized = true;
        stopDeadline();
        this.settleProbe(probing, false);
      }
      if (released) return;
      released = true;
      this.release();
    };

    return {
      signal: controller.signal,
      succeeded: () => {
        if (finalized || succeededAt !== null) return;
        succeededAt = this.now();
        stopDeadline();
        this.recordSuccess(succeededAt - startedAt, probing);
      },
      failed: (error: unknown) => {
        if (finalized) return;
        finalized = true;
        stopDeadline();
        if (error instanceof DependencyTimeoutError) this.totals.timeouts += 1;
        // A stream that failed after its first chunk has already settled the
        // half-open probe, so only the rolling window may still move.
        const stillProbing = probing && succeededAt === null;
        if (this.isCallerAbort(error, options.signal)) {
          this.settleProbe(stillProbing, false);
        } else if (this.isFailure(error)) {
          this.recordFailure(this.now() - startedAt, stillProbing, error);
        } else if (succeededAt === null) {
          this.recordSuccess(this.now() - startedAt, stillProbing);
        }
      },
      release,
    };
  }

  private admit(): boolean {
    this.refreshState();
    if (this.state === 'open') {
      this.totals.shortCircuited += 1;
      throw new CircuitOpenError(this.name, this.retryAfterMs() ?? this.currentOpenMs);
    }
    if (this.state !== 'half_open') return false;
    if (this.halfOpenInFlight >= this.halfOpenMaxCalls) {
      this.totals.shortCircuited += 1;
      throw new CircuitOpenError(this.name, this.retryAfterMs() ?? this.currentOpenMs);
    }
    this.halfOpenInFlight += 1;
    return true;
  }

  private rejectionReason(error: unknown): DependencyRejectionReason {
    if (error instanceof CircuitOpenError) return 'open';
    if (error instanceof DependencyOverloadedError) return 'overloaded';
    if (error instanceof DependencyTimeoutError) return 'timeout';
    return 'error';
  }

  private async run<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    options: ExecuteOptions<T>,
  ): Promise<T> {
    const probing = this.admit();

    try {
      await this.acquire(probing, options.signal);
    } catch (error) {
      if (probing) this.halfOpenInFlight -= 1;
      throw error;
    }

    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort(options.signal?.reason);
    if (options.signal) {
      if (options.signal.aborted) controller.abort(options.signal.reason);
      else options.signal.addEventListener('abort', abortFromCaller, { once: true });
    }

    const startedAt = this.now();
    let released = false;
    // Released only in the `finally`, i.e. after the outcome is recorded. Releasing
    // earlier hands the freed slot to a queued caller before a tripping failure has
    // opened the circuit, which sends that caller straight at the dead dependency.
    // On timeout the slot is freed even though the operation may still be running
    // upstream: `operation` is handed an abort signal and is expected to honour it,
    // and holding slots for unresponsive work turns the bulkhead into a deadlock.
    const releaseSlot = () => {
      if (released) return;
      released = true;
      this.release();
    };

    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<never>((_, reject) => {
      timer = unref(
        setTimeout(() => {
          const error = new DependencyTimeoutError(this.name, timeoutMs);
          controller.abort(error);
          reject(error);
        }, timeoutMs),
      );
    });

    try {
      const result = await Promise.race([operation(controller.signal), timeout]);
      this.recordSuccess(this.now() - startedAt, probing);
      return result;
    } catch (error) {
      if (error instanceof DependencyTimeoutError) {
        this.totals.timeouts += 1;
      }
      if (this.isCallerAbort(error, options.signal)) {
        this.settleProbe(probing, false);
      } else if (this.isFailure(error)) {
        this.recordFailure(this.now() - startedAt, probing, error);
      } else {
        this.recordSuccess(this.now() - startedAt, probing);
      }
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener('abort', abortFromCaller);
      releaseSlot();
    }
  }

  private isCallerAbort(error: unknown, signal: AbortSignal | undefined): boolean {
    if (error instanceof DependencyTimeoutError) return false;
    return signal?.aborted === true;
  }

  private settleProbe(probing: boolean, succeeded: boolean): void {
    if (!probing) return;
    this.halfOpenInFlight -= 1;
    if (!succeeded) return;
    this.halfOpenSuccesses += 1;
  }

  private async acquire(probing: boolean, signal: AbortSignal | undefined): Promise<void> {
    if (probing || this.inFlight < this.maxConcurrent) {
      this.inFlight += 1;
      return;
    }

    if (this.waiters.length >= this.maxQueued) {
      this.totals.shed += 1;
      throw new DependencyOverloadedError(this.name, this.maxConcurrent, this.maxQueued);
    }

    await new Promise<void>((resolve, reject) => {
      const waiter: Waiter = { resolve, reject, timer: null, settled: false };
      const settle = (fn: () => void) => {
        if (waiter.settled) return;
        waiter.settled = true;
        if (waiter.timer) clearTimeout(waiter.timer);
        signal?.removeEventListener('abort', onAbort);
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        fn();
      };
      const onAbort = () => settle(() => reject(signal?.reason ?? new Error('aborted')));

      waiter.timer = unref(
        setTimeout(() => {
          this.totals.shed += 1;
          settle(() =>
            reject(new DependencyOverloadedError(this.name, this.maxConcurrent, this.maxQueued)),
          );
        }, this.queueTimeoutMs),
      );
      waiter.resolve = () => settle(resolve);
      waiter.reject = (error: unknown) => settle(() => reject(error));

      if (signal?.aborted) {
        onAbort();
        return;
      }
      signal?.addEventListener('abort', onAbort, { once: true });
      this.waiters.push(waiter);
    });
  }

  private release(): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter.resolve();
      return;
    }
    this.inFlight = Math.max(0, this.inFlight - 1);
  }

  private recordSuccess(durationMs: number, probing: boolean): void {
    this.totals.calls += 1;
    this.totals.successes += 1;
    const slow = durationMs >= this.slowCallMs;
    if (slow) this.totals.slow += 1;
    const bucket = this.bucket();
    bucket.total += 1;
    if (slow) bucket.slow += 1;

    this.settleProbe(probing, true);
    if (probing && this.halfOpenSuccesses >= this.halfOpenSuccessesToClose) {
      this.transition('closed');
    } else if (!probing) {
      this.evaluate();
    }
  }

  private recordFailure(durationMs: number, probing: boolean, error: unknown): void {
    this.totals.calls += 1;
    this.totals.failures += 1;
    this.lastError = errorText(error);
    const slow = durationMs >= this.slowCallMs;
    if (slow) this.totals.slow += 1;
    const bucket = this.bucket();
    bucket.total += 1;
    bucket.failures += 1;
    if (slow) bucket.slow += 1;

    this.settleProbe(probing, false);
    if (probing) {
      this.transition('open');
      return;
    }
    this.evaluate();
  }

  private evaluate(): void {
    if (this.state !== 'closed') return;
    const stats = this.stats();
    if (stats.samples < this.volumeThreshold) return;
    if (
      stats.failureRate >= this.failureRateThreshold ||
      stats.slowCallRate >= this.slowCallRateThreshold
    ) {
      this.transition('open');
    }
  }

  private transition(to: CircuitState): void {
    if (this.state === to) return;
    const from = this.state;
    const stats = this.stats();
    this.state = to;

    if (to === 'open') {
      this.openedAt = this.now();
      this.currentOpenMs =
        from === 'half_open'
          ? Math.min(this.maxOpenMs, this.currentOpenMs * 2)
          : Math.min(this.maxOpenMs, this.baseOpenMs * Math.pow(2, this.consecutiveTrips));
      this.consecutiveTrips += 1;
      this.halfOpenInFlight = 0;
      this.halfOpenSuccesses = 0;
      this.buckets = [];
      this.rejectWaiters();
    } else if (to === 'half_open') {
      this.halfOpenInFlight = 0;
      this.halfOpenSuccesses = 0;
    } else {
      this.openedAt = null;
      this.consecutiveTrips = 0;
      this.currentOpenMs = this.baseOpenMs;
      this.halfOpenInFlight = 0;
      this.halfOpenSuccesses = 0;
      this.buckets = [];
      this.lastError = null;
    }

    this.onStateChange?.({
      name: this.name,
      from,
      to,
      failureRate: stats.failureRate,
      slowCallRate: stats.slowCallRate,
      samples: stats.samples,
      openMs: this.currentOpenMs,
      lastError: this.lastError,
    });
  }

  private rejectWaiters(): void {
    const pending = this.waiters.splice(0, this.waiters.length);
    for (const waiter of pending) {
      this.totals.shortCircuited += 1;
      waiter.reject(new CircuitOpenError(this.name, this.currentOpenMs));
    }
  }

  private refreshState(): void {
    if (this.state !== 'open' || this.openedAt === null) return;
    if (this.now() - this.openedAt >= this.currentOpenMs) {
      this.transition('half_open');
    }
  }

  private bucket(): Bucket {
    const now = this.now();
    const width = this.windowMs / this.bucketCount;
    const start = Math.floor(now / width) * width;
    const last = this.buckets[this.buckets.length - 1];
    if (last && last.start === start) return last;
    const bucket: Bucket = { start, total: 0, failures: 0, slow: 0 };
    this.buckets.push(bucket);
    this.prune(now);
    return bucket;
  }

  private prune(now: number): void {
    const cutoff = now - this.windowMs;
    while (this.buckets.length > 0) {
      const first = this.buckets[0];
      if (!first || first.start >= cutoff) break;
      this.buckets.shift();
    }
  }

  private stats(): { samples: number; failureRate: number; slowCallRate: number } {
    this.prune(this.now());
    let samples = 0;
    let failures = 0;
    let slow = 0;
    for (const bucket of this.buckets) {
      samples += bucket.total;
      failures += bucket.failures;
      slow += bucket.slow;
    }
    if (samples === 0) return { samples: 0, failureRate: 0, slowCallRate: 0 };
    return { samples, failureRate: failures / samples, slowCallRate: slow / samples };
  }

  private retryAfterMs(): number | null {
    if (this.state !== 'open' || this.openedAt === null) return null;
    return Math.max(0, this.currentOpenMs - (this.now() - this.openedAt));
  }

  currentState(): CircuitState {
    this.refreshState();
    return this.state;
  }

  isAvailable(): boolean {
    return this.currentState() !== 'open';
  }

  snapshot(): CircuitBreakerSnapshot {
    this.refreshState();
    const stats = this.stats();
    return {
      name: this.name,
      state: this.state,
      healthy: this.state === 'closed',
      samples: stats.samples,
      failureRate: Number(stats.failureRate.toFixed(4)),
      slowCallRate: Number(stats.slowCallRate.toFixed(4)),
      inFlight: this.inFlight,
      queued: this.waiters.length,
      maxConcurrent: this.maxConcurrent,
      retryAfterMs: this.retryAfterMs(),
      openedAt: this.openedAt,
      consecutiveTrips: this.consecutiveTrips,
      lastError: this.lastError,
      totals: { ...this.totals },
    };
  }

  forceOpen(): void {
    this.transition('open');
  }

  reset(): void {
    this.rejectWaiters();
    this.state = 'closed';
    this.buckets = [];
    this.openedAt = null;
    this.currentOpenMs = this.baseOpenMs;
    this.consecutiveTrips = 0;
    this.halfOpenInFlight = 0;
    this.halfOpenSuccesses = 0;
    this.inFlight = 0;
    this.lastError = null;
    this.totals = {
      calls: 0,
      successes: 0,
      failures: 0,
      timeouts: 0,
      slow: 0,
      shortCircuited: 0,
      shed: 0,
      fallbacks: 0,
    };
  }
}

const registry = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(options: CircuitBreakerOptions): CircuitBreaker {
  const existing = registry.get(options.name);
  if (existing) return existing;
  const breaker = new CircuitBreaker(options);
  registry.set(options.name, breaker);
  return breaker;
}

export function circuitBreakerSnapshots(): CircuitBreakerSnapshot[] {
  return [...registry.values()].map((breaker) => breaker.snapshot());
}

export function resetCircuitBreakers(): void {
  for (const breaker of registry.values()) breaker.reset();
  registry.clear();
}
