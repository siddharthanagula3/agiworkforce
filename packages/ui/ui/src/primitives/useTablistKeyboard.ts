'use client';

import { useCallback, type KeyboardEvent } from 'react';

const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown']);
const PREVIOUS_KEYS = new Set(['ArrowLeft', 'ArrowUp']);
const FIRST_KEY = 'Home';
const LAST_KEY = 'End';

export function useTablistKeyboard({
  count,
  active,
  onSelect,
  tabId,
}: {
  count: number;
  active: number;
  onSelect: (index: number) => void;
  tabId: (index: number) => string;
}): {
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  tabIndexFor: (index: number) => 0 | -1;
} {
  const moveTo = useCallback(
    (target: number) => {
      onSelect(target);
      document.getElementById(tabId(target))?.focus();
    },
    [onSelect, tabId],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (count <= 0) return;
      if (event.key === FIRST_KEY) {
        event.preventDefault();
        moveTo(0);
        return;
      }
      if (event.key === LAST_KEY) {
        event.preventDefault();
        moveTo(count - 1);
        return;
      }
      const step = NEXT_KEYS.has(event.key) ? 1 : PREVIOUS_KEYS.has(event.key) ? -1 : 0;
      if (step === 0) return;
      event.preventDefault();
      moveTo((active + step + count) % count);
    },
    [count, active, moveTo],
  );

  const tabIndexFor = useCallback((index: number): 0 | -1 => (index === active ? 0 : -1), [active]);

  return { onKeyDown, tabIndexFor };
}
