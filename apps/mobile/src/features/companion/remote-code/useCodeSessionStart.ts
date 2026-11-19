import { useCallback, useEffect, useRef, useState } from 'react';
import { startCodeSession } from './service';
import { forgetCodeSessionStart, useRemoteCodeStore } from './store';

export const CODE_SESSION_START_FAILED =
  'The session was not started. Check the Desktop connection and try again.';

export interface CodeSessionStart {
  starting: boolean;
  error: string | null;
  start: (rootId: string, task: string) => Promise<void>;
}

export function useCodeSessionStart(
  onStarted: (rootId: string, threadId: string) => void,
): CodeSessionStart {
  const starts = useRemoteCodeStore((state) => state.starts);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const settled = pending ? starts[pending] : undefined;
  const onStartedRef = useRef(onStarted);
  onStartedRef.current = onStarted;

  useEffect(() => {
    if (!pending || !settled) return;
    if (settled.threadId) {
      forgetCodeSessionStart(pending);
      setPending(null);
      onStartedRef.current(settled.rootId, settled.threadId);
    } else if (settled.error) {
      forgetCodeSessionStart(pending);
      setPending(null);
      setError(settled.error);
    }
  }, [pending, settled]);

  const start = useCallback(async (rootId: string, task: string) => {
    setError(null);
    const id = await startCodeSession(rootId, task);
    if (id) setPending(id);
    else setError(CODE_SESSION_START_FAILED);
  }, []);

  return { starting: pending !== null, error, start };
}
