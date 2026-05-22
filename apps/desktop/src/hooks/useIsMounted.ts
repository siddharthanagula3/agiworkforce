/**
 * useIsMounted — returns a ref whose `.current` flips to `false` after the
 * component unmounts.
 *
 * Use to guard `setState` calls that happen after `await` in async event
 * handlers. Without the guard, an async handler that resolves after the
 * component unmounts (e.g. user clicks Disconnect → parent removes the
 * card from a list → mid-promise unmount) will trigger React's
 * "Can't perform a React state update on an unmounted component"
 * warning AND potentially overwrite fresher state from a new mount with
 * stale resolved values from the previous one.
 *
 * Self-audit (2026-05-21) found 67 desktop components with this exact
 * pattern — extracting the hook makes the fix one import + one check per
 * consumer instead of 9-line boilerplate.
 *
 * Usage:
 * ```tsx
 * const isMounted = useIsMounted();
 *
 * const handleClick = useCallback(async () => {
 *   setLoading(true);
 *   try {
 *     await doWork();
 *     if (!isMounted.current) return;
 *     setData(result);
 *   } finally {
 *     if (isMounted.current) setLoading(false);
 *   }
 * }, []);
 * ```
 */

import { useEffect, useRef, type RefObject } from 'react';

export function useIsMounted(): RefObject<boolean> {
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  return mountedRef;
}
