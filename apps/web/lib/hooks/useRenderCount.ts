/**
 * useRenderCount - Development hook to track component re-renders
 *
 * Useful for debugging unnecessary re-renders during optimization.
 * Production builds: no-op (zero overhead).
 */

import { useRef, useEffect } from 'react';

interface RenderCountOptions {
  enabled?: boolean;
  logInterval?: number;
}

/**
 * Hook to count and log component renders
 * Development only - zero overhead in production
 *
 * @param componentName - Display name for logging
 * @param options - Configuration options
 */
export function useRenderCount(componentName: string, options: RenderCountOptions = {}): number {
  const { enabled = process.env.NODE_ENV === 'development', logInterval = 5 } = options;

  const countRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    countRef.current++;

    // Log every N renders to avoid console spam
    if (countRef.current % logInterval === 1) {
      console.debug(`[RenderCount] ${componentName}: ${countRef.current} renders`);
    }
  });

  return countRef.current;
}

/**
 * Hook to track render count and warn on excessive re-renders
 *
 * @param componentName - Display name for logging
 * @param threshold - Warn if renders exceed this count
 */
export function useRenderCountWithThreshold(componentName: string, threshold: number = 10): number {
  const { enabled = process.env.NODE_ENV === 'development' } = {};

  const countRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    countRef.current++;

    if (countRef.current > threshold) {
      console.warn(
        `[RenderCount] ${componentName}: Excessive renders (${countRef.current}). Consider memoization.`,
      );
    }
  });

  return countRef.current;
}
