/**
 * Performance Utilities
 *
 * Helper functions for optimizing React component performance.
 * Includes memoization, debouncing, and batching utilities.
 */

/**
 * Debounce a function call
 * Delays execution until the function hasn't been called for `delay` ms
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return function (...args: Parameters<T>) {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      func(...args);
      timeoutId = null;
    }, delay);
  };
}

/**
 * Throttle a function call
 * Limits execution to at most once every `interval` ms
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  func: T,
  interval: number,
): (...args: Parameters<T>) => void {
  let lastCallTime = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return function (...args: Parameters<T>) {
    const now = Date.now();
    const timeSinceLastCall = now - lastCallTime;

    if (timeSinceLastCall >= interval) {
      func(...args);
      lastCallTime = now;
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    } else {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
        func(...args);
        lastCallTime = Date.now();
        timeoutId = null;
      }, interval - timeSinceLastCall);
    }
  };
}

/**
 * Batch updates within a single requestAnimationFrame
 * Reduces re-renders by batching state updates
 */
export function batchUpdates(callback: () => void): void {
  if ('unstable_batchedUpdates' in (window as unknown as Record<string, unknown>)) {
    // React 18 with unstable_batchedUpdates
    const batchedUpdates = (window as unknown as Record<string, unknown>)
      .unstable_batchedUpdates as (cb: () => void) => void;
    batchedUpdates(callback);
  } else {
    // Fallback: just call the callback
    callback();
  }
}

/**
 * Request idle callback with fallback to setTimeout
 * Executes callback when the browser is idle
 */
export function requestIdleCallback(callback: IdleRequestCallback): number {
  if ('requestIdleCallback' in window) {
    return window.requestIdleCallback(callback);
  } else {
    // Fallback to setTimeout with 1000ms delay
    return window.setTimeout(() => callback({} as IdleDeadline), 1000) as unknown as number;
  }
}

/**
 * Request idle callback cancel with fallback
 */
export function cancelIdleCallback(id: number): void {
  if ('cancelIdleCallback' in window) {
    window.cancelIdleCallback(id);
  } else {
    clearTimeout(id);
  }
}

/**
 * Measure performance of a function
 * Useful for profiling during development
 */
export function measurePerformance<T>(
  label: string,
  func: () => T,
): { result: T; duration: number } {
  const start = performance.now();
  const result = func();
  const duration = performance.now() - start;

  if (process.env.NODE_ENV === 'development' && duration > 50) {
    console.warn(`[Performance] ${label} took ${duration.toFixed(2)}ms`);
  }

  return { result, duration };
}

/**
 * Mark performance checkpoint
 * Use with performance.measureUserTiming() API
 */
export function markPerformance(label: string): void {
  if ('performance' in window && 'mark' in window.performance) {
    window.performance.mark(label);
  }
}

/**
 * Measure between two performance marks
 */
export function measureBetweenMarks(startMark: string, endMark: string, measure: string): void {
  if ('performance' in window && 'measure' in window.performance) {
    try {
      window.performance.measure(measure, startMark, endMark);
    } catch (e) {
      // Marks don't exist
    }
  }
}

/**
 * Get all performance entries of a specific type
 */
export function getPerformanceEntries(type: PerformanceEntryType): PerformanceEntry[] {
  if ('performance' in window && 'getEntriesByType' in window.performance) {
    return window.performance.getEntriesByType(type);
  }
  return [];
}

/**
 * Calculate Core Web Vitals
 * Returns Promise<CoreWebVitals>
 */
export interface CoreWebVitals {
  lcpValue: number;
  fidValue: number;
  clsValue: number;
  inpValue: number;
}

export async function getCoreWebVitals(): Promise<Partial<CoreWebVitals>> {
  const vitals: Partial<CoreWebVitals> = {};

  // LCP: Largest Contentful Paint
  if ('PerformanceObserver' in window) {
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        vitals.lcpValue = lastEntry.renderTime || lastEntry.loadTime;
      });
      observer.observe({ entryTypes: ['largest-contentful-paint'] });
    } catch (e) {
      // PerformanceObserver not supported
    }
  }

  return vitals;
}

/**
 * Log performance metrics to console
 * For debugging and profiling
 */
export function logPerformanceMetrics(): void {
  if (process.env.NODE_ENV === 'development' && 'performance' in window) {
    const navigationTiming = performance.getEntriesByType(
      'navigation',
    )[0] as PerformanceNavigationTiming;

    if (navigationTiming) {
      console.log('[Performance Metrics]');
      console.log(
        `  DNS: ${(navigationTiming.domainLookupEnd - navigationTiming.domainLookupStart).toFixed(0)}ms`,
      );
      console.log(
        `  TCP: ${(navigationTiming.connectEnd - navigationTiming.connectStart).toFixed(0)}ms`,
      );
      console.log(
        `  TTFB: ${(navigationTiming.responseStart - navigationTiming.requestStart).toFixed(0)}ms`,
      );
      console.log(
        `  DL: ${(navigationTiming.responseEnd - navigationTiming.responseStart).toFixed(0)}ms`,
      );
      console.log(
        `  DOM Parse: ${(navigationTiming.domInteractive - navigationTiming.domLoading).toFixed(0)}ms`,
      );
      console.log(
        `  DOM Content Load: ${(navigationTiming.domContentLoadedEventEnd - navigationTiming.domContentLoadedEventStart).toFixed(0)}ms`,
      );
      console.log(
        `  Load Complete: ${(navigationTiming.loadEventEnd - navigationTiming.loadEventStart).toFixed(0)}ms`,
      );
    }
  }
}
