/**
 * useStoreSelectorOptimized Hook
 *
 * Wrapper around Zustand selectors with shallow comparison.
 * Prevents unnecessary re-renders when using store slices.
 *
 * Usage:
 * ```typescript
 * // Instead of this (causes re-renders on any store change):
 * const messages = useUnifiedChatStore((state) => state.messages);
 *
 * // Use this (only re-renders when messages array reference changes):
 * const messages = useStoreSelectorOptimized(
 *   useUnifiedChatStore,
 *   (state) => state.messages,
 *   shallowEqual
 * );
 * ```
 */

import { useMemo, useRef } from 'react';

/**
 * Shallow equality comparison
 * Returns true if both objects have the same properties and values
 */
export function shallowEqual<T>(obj1: T, obj2: T): boolean {
  if (obj1 === obj2) return true;
  if (!obj1 || !obj2) return false;

  const keys1 = Object.keys(obj1 as Record<string, unknown>);
  const keys2 = Object.keys(obj2 as Record<string, unknown>);

  if (keys1.length !== keys2.length) return false;

  for (const key of keys1) {
    if ((obj1 as Record<string, unknown>)[key] !== (obj2 as Record<string, unknown>)[key]) {
      return false;
    }
  }

  return true;
}

/**
 * Array shallow equality - compares array length and references
 */
export function shallowArrayEqual<T>(arr1: T[], arr2: T[]): boolean {
  if (arr1 === arr2) return true;
  if (arr1.length !== arr2.length) return false;

  for (let i = 0; i < arr1.length; i++) {
    if (arr1[i] !== arr2[i]) return false;
  }

  return true;
}

/**
 * Optimized store selector with memoization
 * Prevents re-renders when selected value hasn't actually changed
 */
export function useStoreSelectorOptimized<T, S>(
  useStore: (selector: (state: T) => S) => S,
  selector: (state: T) => S,
  equalityFn: (a: S, b: S) => boolean = shallowEqual,
): S {
  const previousRef = useRef<S>();

  const selected = useStore(selector);

  // Check if selected value has actually changed
  const result = useMemo(() => {
    if (previousRef.current !== undefined && equalityFn(selected, previousRef.current)) {
      // Return previous value to preserve reference equality
      return previousRef.current;
    }

    previousRef.current = selected;
    return selected;
  }, [selected, equalityFn]);

  return result;
}

/**
 * Create a memoized selector factory for a store
 * Useful for creating multiple selectors from the same store
 *
 * Usage:
 * ```typescript
 * const createChatSelectors = createSelectorFactory(useUnifiedChatStore);
 * const messages = createChatSelectors((state) => state.messages);
 * ```
 */
export function createSelectorFactory<T>(useStore: (selector: (state: T) => unknown) => unknown) {
  return function <S>(
    selector: (state: T) => S,
    equalityFn: (a: S, b: S) => boolean = shallowEqual,
  ): S {
    return useStoreSelectorOptimized(
      useStore as (selector: (state: T) => S) => S,
      selector,
      equalityFn,
    );
  };
}
