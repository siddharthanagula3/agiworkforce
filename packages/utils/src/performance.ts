/**
 * Performance Instrumentation Helpers
 *
 * Zero-dependency, isomorphic (browser, Node, React Native) utilities
 * for measuring execution time and tracking performance metrics.
 *
 * @module performance
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------
// Time source — uses performance.now() when available, falls back to Date.now()
// ---------------------------------------------------------------------------

/**
 * High-resolution timer that works across all JS runtimes.
 * Uses `performance.now()` when available (sub-millisecond precision),
 * otherwise falls back to `Date.now()`.
 */
function now(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

// ---------------------------------------------------------------------------
// Measurement functions
// ---------------------------------------------------------------------------

/** Result of a measured operation. */
export interface MeasureResult<T> {
  result: T;
  durationMs: number;
}

/**
 * Measure the execution time of an async function.
 *
 * @param label - Descriptive label for logging/debugging
 * @param fn - Async function to measure
 * @returns The function result and its duration in milliseconds
 *
 * @example
 * ```typescript
 * const { result, durationMs } = await measureAsync('fetchModels', async () => {
 *   return fetch('/api/models').then(r => r.json());
 * });
 * console.log(`Fetched in ${durationMs}ms`);
 * ```
 */
export async function measureAsync<T>(
  _label: string,
  fn: () => Promise<T>,
): Promise<MeasureResult<T>> {
  const start = now();
  const result = await fn();
  const durationMs = Math.round((now() - start) * 100) / 100;
  return { result, durationMs };
}

/**
 * Measure the execution time of a synchronous function.
 *
 * @param label - Descriptive label for logging/debugging
 * @param fn - Synchronous function to measure
 * @returns The function result and its duration in milliseconds
 *
 * @example
 * ```typescript
 * const { result, durationMs } = measureSync('parseJSON', () => {
 *   return JSON.parse(largePayload);
 * });
 * console.log(`Parsed in ${durationMs}ms`);
 * ```
 */
export function measureSync<T>(_label: string, fn: () => T): MeasureResult<T> {
  const start = now();
  const result = fn();
  const durationMs = Math.round((now() - start) * 100) / 100;
  return { result, durationMs };
}

// ---------------------------------------------------------------------------
// PerformanceTracker class
// ---------------------------------------------------------------------------

/** Aggregated metrics for a single label. */
export interface PerformanceMetrics {
  count: number;
  avgMs: number;
  p50Ms: number;
  p99Ms: number;
  maxMs: number;
}

/**
 * Tracks performance metrics across multiple measurements for named labels.
 *
 * Maintains a history of durations per label and computes percentile
 * statistics on demand. All time values are in milliseconds.
 *
 * @example
 * ```typescript
 * const tracker = new PerformanceTracker();
 *
 * tracker.start('render');
 * // ... do work ...
 * const ms = tracker.end('render'); // returns duration
 *
 * // After many measurements:
 * const metrics = tracker.getMetrics();
 * console.log(metrics['render'].p99Ms);
 * ```
 */
export class PerformanceTracker {
  /** Active timers: label -> start timestamp. */
  private timers = new Map<string, number>();

  /** Recorded durations per label. */
  private durations = new Map<string, number[]>();

  /**
   * Start a timer for the given label.
   * If a timer with this label is already running, it is silently restarted.
   *
   * @param label - Unique identifier for this measurement
   */
  start(label: string): void {
    this.timers.set(label, now());
  }

  /**
   * End a timer for the given label and record the duration.
   *
   * @param label - The label that was passed to `start()`
   * @returns Duration in milliseconds
   * @throws Error if no timer with the given label is active
   */
  end(label: string): number {
    const startTime = this.timers.get(label);
    if (startTime === undefined) {
      throw new Error(`PerformanceTracker: no active timer for label "${label}"`);
    }

    const durationMs = Math.round((now() - startTime) * 100) / 100;
    this.timers.delete(label);

    const history = this.durations.get(label) ?? [];
    history.push(durationMs);
    this.durations.set(label, history);

    return durationMs;
  }

  /**
   * Record an externally-measured duration for a label.
   * Useful when you measure time outside the tracker but still want
   * aggregated stats.
   *
   * @param label - Metric label
   * @param durationMs - Duration in milliseconds
   */
  record(label: string, durationMs: number): void {
    const history = this.durations.get(label) ?? [];
    history.push(durationMs);
    this.durations.set(label, history);
  }

  /**
   * Get aggregated metrics for all tracked labels.
   *
   * @returns Map of label -> metrics (count, avg, p50, p99, max)
   */
  getMetrics(): Record<string, PerformanceMetrics> {
    const result: Record<string, PerformanceMetrics> = {};

    for (const [label, values] of this.durations.entries()) {
      if (values.length === 0) continue;

      const sorted = [...values].sort((a, b) => a - b);
      const count = sorted.length;
      const sum = sorted.reduce((acc, v) => acc + v, 0);

      result[label] = {
        count,
        avgMs: Math.round((sum / count) * 100) / 100,
        p50Ms: percentile(sorted, 50),
        p99Ms: percentile(sorted, 99),
        maxMs: sorted[sorted.length - 1]!,
      };
    }

    return result;
  }

  /**
   * Get metrics for a single label, or null if no data exists.
   *
   * @param label - Metric label
   */
  getMetricsFor(label: string): PerformanceMetrics | null {
    const values = this.durations.get(label);
    if (!values || values.length === 0) return null;

    const sorted = [...values].sort((a, b) => a - b);
    const count = sorted.length;
    const sum = sorted.reduce((acc, v) => acc + v, 0);

    return {
      count,
      avgMs: Math.round((sum / count) * 100) / 100,
      p50Ms: percentile(sorted, 50),
      p99Ms: percentile(sorted, 99),
      maxMs: sorted[sorted.length - 1]!,
    };
  }

  /**
   * Reset all timers and recorded data.
   */
  reset(): void {
    this.timers.clear();
    this.durations.clear();
  }

  /**
   * Reset data for a single label only.
   *
   * @param label - Metric label to reset
   */
  resetLabel(label: string): void {
    this.timers.delete(label);
    this.durations.delete(label);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Compute a percentile value from a sorted array.
 * Uses the nearest-rank method.
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;

  const index = Math.ceil((p / 100) * sorted.length) - 1;
  const clampedIndex = Math.max(0, Math.min(index, sorted.length - 1));
  return sorted[clampedIndex]!;
}
