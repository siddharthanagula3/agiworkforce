/**
 * useClickOutside Hook
 *
 * Detects clicks outside a specified element.
 */

import { useEffect, RefObject } from 'react';

export interface UseClickOutsideOptions {
  /** Reference to the element to monitor */
  ref: RefObject<HTMLElement | null>;
  /** Callback when click occurs outside */
  onClickOutside: () => void;
  /** Whether the handler is enabled */
  enabled?: boolean;
}

export function useClickOutside(options: UseClickOutsideOptions): void {
  const { ref, onClickOutside, enabled = true } = options;

  useEffect(() => {
    if (!enabled) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClickOutside();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [ref, onClickOutside, enabled]);
}

export default useClickOutside;
