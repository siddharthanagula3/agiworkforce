'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';

/**
 * Error recovery hook for handling and recovering from errors
 * Provides retry logic, error logging, and state reset capabilities
 */
export interface UseErrorRecoveryOptions {
  onError?: (error: Error) => void;
  maxRetries?: number;
  retryDelay?: number;
  showToast?: boolean;
  toastMessage?: string;
}

export function useErrorRecovery(options: UseErrorRecoveryOptions = {}) {
  const {
    onError,
    maxRetries = 3,
    retryDelay = 1000,
    showToast = true,
    toastMessage = 'An error occurred. Please try again.',
  } = options;

  const [error, setError] = useState<Error | null>(null);
  const [isRecovering, setIsRecovering] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const handleError = useCallback(
    (err: Error | string) => {
      const error = typeof err === 'string' ? new Error(err) : err;

      setError(error);
      console.error('[useErrorRecovery] Error caught:', error);

      if (onError) {
        onError(error);
      }

      if (showToast) {
        toast.error(toastMessage);
      }
    },
    [onError, showToast, toastMessage],
  );

  const retry = useCallback(
    async (fn: () => Promise<void>) => {
      if (retryCount >= maxRetries) {
        toast.error(`Failed after ${maxRetries} attempts`);
        return;
      }

      setIsRecovering(true);
      setRetryCount((prev) => prev + 1);

      try {
        await new Promise((resolve) => setTimeout(resolve, retryDelay * retryCount));
        await fn();
        setError(null);
        setRetryCount(0);
        setIsRecovering(false);
        toast.success('Recovered successfully');
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        handleError(error);
        setIsRecovering(false);
      }
    },
    [retryCount, maxRetries, retryDelay, handleError],
  );

  const reset = useCallback(() => {
    setError(null);
    setRetryCount(0);
    setIsRecovering(false);
  }, []);

  return {
    error,
    isRecovering,
    retryCount,
    handleError,
    retry,
    reset,
  };
}
