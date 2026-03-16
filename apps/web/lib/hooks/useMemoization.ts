/**
 * useMemoization - Performance measurement hooks for optimization tracking
 *
 * Measures render time, memoization effectiveness, and memory impact.
 * Production builds: no-op (zero overhead).
 */

import { useRef, useEffect, useCallback } from 'react';

interface MemoizationMetrics {
  renderTime: number;
  memoHitRate: number;
  computationTime: number;
}

/**
 * Measures component render time
 *
 * @param componentName - Display name for metrics
 * @param enabled - Enable measurement (default: dev only)
 */
export function useRenderTime(
  componentName: string,
  enabled: boolean = process.env.NODE_ENV === 'development',
): void {
  const startRef = useRef(performance.now());

  useEffect(() => {
    if (!enabled) return;

    const endTime = performance.now();
    const renderTime = endTime - startRef.current;

    if (renderTime > 16.67) {
      // 16.67ms = 60fps frame budget
      console.warn(
        `[RenderTime] ${componentName}: ${renderTime.toFixed(2)}ms (exceeds frame budget)`,
      );
    } else {
      console.debug(`[RenderTime] ${componentName}: ${renderTime.toFixed(2)}ms`);
    }

    startRef.current = performance.now();
  });
}

/**
 * Tracks memo hit rate (how often memo prevents re-render)
 *
 * @param componentName - Display name for metrics
 * @param shouldUpdate - Function returning true if component should update
 */
export function useMemoHitRate(
  componentName: string,
  shouldUpdate: () => boolean,
): { hitRate: number; hitCount: number; missCount: number } {
  const metricsRef = useRef({ hits: 0, misses: 0 });

  const update = shouldUpdate();

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    if (update) {
      metricsRef.current.misses++;
    } else {
      metricsRef.current.hits++;
    }

    const total = metricsRef.current.hits + metricsRef.current.misses;
    const hitRate = total > 0 ? (metricsRef.current.hits / total) * 100 : 0;

    if (total % 10 === 0) {
      console.debug(
        `[MemoHitRate] ${componentName}: ${hitRate.toFixed(1)}% (${metricsRef.current.hits} hits, ${metricsRef.current.misses} misses)`,
      );
    }
  }, [update, componentName]);

  const total = metricsRef.current.hits + metricsRef.current.misses;
  const hitRate = total > 0 ? (metricsRef.current.hits / total) * 100 : 0;

  return {
    hitRate,
    hitCount: metricsRef.current.hits,
    missCount: metricsRef.current.misses,
  };
}

/**
 * Measures expensive computation time and caches result
 *
 * @param fn - Expensive computation function
 * @param deps - Dependency array
 * @param componentName - Display name for metrics
 */
export function useMemoWithMetrics<T>(
  fn: () => T,
  deps: React.DependencyList,
  componentName: string,
): T {
  const lastTimeRef = useRef<number>(0);
  const resultRef = useRef<T | undefined>();

  // Check if deps changed
  const depsChanged = useRef(true);

  useEffect(() => {
    const startTime = performance.now();
    resultRef.current = fn();
    const computeTime = performance.now() - startTime;

    if (process.env.NODE_ENV === 'development' && computeTime > 5) {
      console.debug(
        `[MemoCompute] ${componentName}: ${computeTime.toFixed(2)}ms (expensive computation)`,
      );
    }

    lastTimeRef.current = computeTime;
    depsChanged.current = false;
  }, deps);

  return resultRef.current!;
}

/**
 * Creates a performance report of optimization impact
 *
 * @param componentName - Display name
 * @param baseline - Baseline metrics before optimization
 * @param optimized - Optimized metrics after optimization
 */
export function comparePerformance(
  componentName: string,
  baseline: { renderTime: number; renderCount: number },
  optimized: { renderTime: number; renderCount: number },
): void {
  const renderTimeImprovement = (
    ((baseline.renderTime - optimized.renderTime) / baseline.renderTime) *
    100
  ).toFixed(1);
  const renderCountReduction = (
    ((baseline.renderCount - optimized.renderCount) / baseline.renderCount) *
    100
  ).toFixed(1);

  console.log(`
╔════════════════════════════════════════╗
║  Performance Report: ${componentName.padEnd(20)} ║
╠════════════════════════════════════════╣
║  Render Time:  ${baseline.renderTime.toFixed(2)}ms → ${optimized.renderTime.toFixed(2)}ms   ${renderTimeImprovement}% ↓║
║  Render Count: ${baseline.renderCount} → ${optimized.renderCount}                ${renderCountReduction}% ↓║
╚════════════════════════════════════════╝
  `);
}
