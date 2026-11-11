import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';

export interface RetryableRead<T> {
  value: T | null;
  failed: boolean;
  retry: () => void;
  setValue: Dispatch<SetStateAction<T | null>>;
}

export function useRetryableRead<T>(
  load: () => Promise<T>,
  readAgainWhen?: unknown,
): RetryableRead<T> {
  const [value, setValue] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    load()
      .then((next) => {
        if (!cancelled) setValue(next);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [load, attempt, readAgainWhen]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  return { value, failed, retry, setValue };
}
