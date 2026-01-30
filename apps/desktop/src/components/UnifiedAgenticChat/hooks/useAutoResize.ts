/**
 * useAutoResize Hook
 *
 * Automatically resizes a textarea based on its content.
 */

import { useEffect, RefObject } from 'react';

export interface UseAutoResizeOptions {
  /** Reference to the textarea element */
  ref: RefObject<HTMLTextAreaElement | null>;
  /** Content to watch for changes */
  content: string;
  /** Line height in pixels */
  lineHeight?: number;
  /** Maximum number of rows */
  maxRows?: number;
}

export function useAutoResize(options: UseAutoResizeOptions): void {
  const { ref, content, lineHeight = 24, maxRows = 10 } = options;

  useEffect(() => {
    const textarea = ref.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      const maxHeight = lineHeight * maxRows;
      textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    }
  }, [ref, content, lineHeight, maxRows]);
}

export default useAutoResize;
