/**
 * useLeaderKey — leader-key state machine for two-stroke keyboard shortcuts.
 *
 * State machine:  idle → leaderPressed → awaitingKey → execute | timeout → idle
 *
 * Default leader key: Ctrl+Space
 * After leader press, the user has 1 second to press the second key.
 *
 * Usage:
 *   useLeaderKey({ n: () => createNewChat(), m: () => openModelSelector() });
 *   // Press Ctrl+Space, then N → new chat
 */

import { useCallback, useEffect, useRef } from 'react';

type LeaderState = 'idle' | 'awaitingKey';

const DEFAULT_LEADER_KEY = 'ctrl+space';
const LEADER_TIMEOUT_MS = 1000;

function parseLeaderKey(leaderKey: string): { key: string; ctrl: boolean; meta: boolean } {
  const lower = leaderKey.toLowerCase();
  const parts = lower.split('+');
  const key = parts[parts.length - 1] ?? '';
  return {
    key,
    ctrl: parts.includes('ctrl'),
    meta: parts.includes('meta'),
  };
}

function isLeaderCombo(event: KeyboardEvent, leader: ReturnType<typeof parseLeaderKey>): boolean {
  return (
    event.key.toLowerCase() === leader.key &&
    event.ctrlKey === leader.ctrl &&
    event.metaKey === leader.meta &&
    !event.shiftKey &&
    !event.altKey
  );
}

/**
 * Registers a leader-key two-stroke shortcut system.
 *
 * @param bindings - Map of second-key (lowercase, single char) → action callback
 * @param leaderKey - The leader key combo string (default "ctrl+space")
 */
export function useLeaderKey(
  bindings: Record<string, () => void>,
  leaderKey: string = DEFAULT_LEADER_KEY,
): void {
  const stateRef = useRef<LeaderState>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bindingsRef = useRef<Record<string, () => void>>(bindings);
  bindingsRef.current = bindings;

  const resetToIdle = useCallback(() => {
    stateRef.current = 'idle';
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const parsedLeader = parseLeaderKey(leaderKey);

      if (stateRef.current === 'idle') {
        if (isLeaderCombo(event, parsedLeader)) {
          event.preventDefault();
          stateRef.current = 'awaitingKey';
          timerRef.current = setTimeout(() => {
            resetToIdle();
          }, LEADER_TIMEOUT_MS);
        }
        return;
      }

      if (stateRef.current === 'awaitingKey') {
        // Escape cancels the sequence
        if (event.key === 'Escape') {
          resetToIdle();
          return;
        }

        // Ignore bare modifier presses
        if (['Control', 'Meta', 'Alt', 'Shift'].includes(event.key)) {
          return;
        }

        const secondKey = event.key.toLowerCase();
        const action = bindingsRef.current[secondKey];

        if (action) {
          event.preventDefault();
          resetToIdle();
          try {
            action();
          } catch (error) {
            console.error('[useLeaderKey] Action failed:', error);
          }
        } else {
          // Unrecognized second key — cancel silently
          resetToIdle();
        }
      }
    },
    [leaderKey, resetToIdle],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, [handleKeyDown]);
}
