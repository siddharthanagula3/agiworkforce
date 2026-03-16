/**
 * useRenderMetrics Hook
 *
 * Tracks component render performance metrics in development mode.
 * Measures:
 * - Render count per component
 * - Render duration
 * - Average render time
 * - Peak render time
 *
 * Usage:
 * ```typescript
 * const { renderCount, avgRenderTime } = useRenderMetrics('MyComponent');
 * ```
 */

import { useEffect, useRef, useState } from 'react';

interface RenderMetrics {
  renderCount: number;
  renderTimes: number[];
  avgRenderTime: number;
  maxRenderTime: number;
  minRenderTime: number;
}

const metricsStore: Map<string, RenderMetrics> = new Map();

export function useRenderMetrics(componentName: string): RenderMetrics {
  const renderCountRef = useRef(0);
  const renderTimesRef = useRef<number[]>([]);
  const startTimeRef = useRef<number>(0);
  const [metrics, setMetrics] = useState<RenderMetrics>({
    renderCount: 0,
    renderTimes: [],
    avgRenderTime: 0,
    maxRenderTime: 0,
    minRenderTime: 0,
  });

  // Record render start time before component renders
  startTimeRef.current = performance.now();

  useEffect(() => {
    // Measure render completion time
    const endTime = performance.now();
    const renderDuration = endTime - startTimeRef.current;

    renderCountRef.current++;
    renderTimesRef.current.push(renderDuration);

    // Keep only last 100 render times to avoid memory issues
    if (renderTimesRef.current.length > 100) {
      renderTimesRef.current.shift();
    }

    // Calculate metrics
    const avgTime =
      renderTimesRef.current.reduce((a, b) => a + b, 0) / renderTimesRef.current.length;
    const maxTime = Math.max(...renderTimesRef.current);
    const minTime = Math.min(...renderTimesRef.current);

    const currentMetrics: RenderMetrics = {
      renderCount: renderCountRef.current,
      renderTimes: [...renderTimesRef.current],
      avgRenderTime: parseFloat(avgTime.toFixed(2)),
      maxRenderTime: parseFloat(maxTime.toFixed(2)),
      minRenderTime: parseFloat(minTime.toFixed(2)),
    };

    setMetrics(currentMetrics);
    metricsStore.set(componentName, currentMetrics);

    // Log performance warnings in development
    if (process.env.NODE_ENV === 'development') {
      if (renderDuration > 50) {
        console.warn(
          `[Performance] ${componentName} slow render: ${renderDuration.toFixed(2)}ms (avg: ${avgTime.toFixed(2)}ms)`,
        );
      }

      // Every 10 renders, log aggregate metrics
      if (renderCountRef.current % 10 === 0) {
        console.info(
          `[Metrics] ${componentName}: ${renderCountRef.current} renders, avg: ${avgTime.toFixed(2)}ms, max: ${maxTime.toFixed(2)}ms`,
        );
      }
    }
  }, [componentName]);

  return metrics;
}

/**
 * Get all collected metrics for analysis
 */
export function getAllMetrics(): Map<string, RenderMetrics> {
  return new Map(metricsStore);
}

/**
 * Export metrics as JSON for analysis
 */
export function exportMetricsAsJSON(): string {
  const metrics: Record<string, RenderMetrics> = {};
  metricsStore.forEach((value, key) => {
    metrics[key] = value;
  });
  return JSON.stringify(metrics, null, 2);
}

/**
 * Clear all metrics
 */
export function clearMetrics(): void {
  metricsStore.clear();
}
