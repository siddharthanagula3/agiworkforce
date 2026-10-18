/**
 * Async Utilities
 *
 * @module async
 * @packageDocumentation
 */

export class AbortError extends Error {
  constructor(message = 'Aborted') {
    super(message);
    this.name = 'AbortError';
  }
}

/**
 * Create a debounced version of a function.
 *
 * The debounced function will only execute after the specified delay
 * has passed without any new calls.
 *
 * The returned function carries `cancel()`, which drops any pending call. A
 * debounced callback that closes over component state MUST be cancelled on
 * unmount: otherwise the trailing timer fires against a torn-down tree. In
 * production that is a React "update on an unmounted component"; under jsdom
 * it is an uncaught `ReferenceError: window is not defined` thrown from
 * `resolveUpdatePriority` well after the owning test finished, which fails the
 * whole run and blames an unrelated file.
 *
 * @param func - Function to debounce
 * @param wait - Delay in milliseconds
 * @returns Debounced function with a `cancel()` method
 *
 * @example
 * ```typescript
 * const debouncedSearch = debounce((query: string) => {
 *   console.log('Searching for:', query);
 * }, 300);
 *
 * debouncedSearch('a');
 * debouncedSearch('ab');
 * debouncedSearch('abc'); // Only this one executes after 300ms
 * ```
 */
export interface DebouncedFunction<TArgs extends unknown[]> {
  (...args: TArgs): void;
  cancel(): void;
}

export function debounce<TArgs extends unknown[], TReturn>(
  func: (...args: TArgs) => TReturn,
  wait: number,
): DebouncedFunction<TArgs> {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const executedFunction = function (...args: TArgs) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  } as DebouncedFunction<TArgs>;

  executedFunction.cancel = () => {
    if (timeout !== null) {
      clearTimeout(timeout);
      timeout = null;
    }
  };

  return executedFunction;
}

/**
 * Execute an async operation with a timeout.
 *
 * @param operation - Async function to execute
 * @param timeoutMs - Timeout in milliseconds
 * @returns Result of the operation
 * @throws Error if operation times out
 *
 * @example
 * ```typescript
 * const result = await withTimeout(
 *   () => fetch('/api/slow-endpoint').then(r => r.json()),
 *   5000
 * );
 * ```
 */
export async function withTimeout<T>(operation: () => Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Operation timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });

  return Promise.race([operation(), timeoutPromise]).finally(() => clearTimeout(timer!));
}
