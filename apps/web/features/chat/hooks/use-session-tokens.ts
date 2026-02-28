import { useState, useEffect } from 'react';
import { tokenLogger } from '@core/integrations/token-usage-tracker';

interface SessionTokens {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
}

function getUsageFromSummary(sessionId: string): SessionTokens {
  const summary = tokenLogger.getSessionSummary(sessionId);
  if (!summary) {
    return { totalTokens: 0, inputTokens: 0, outputTokens: 0, totalCost: 0 };
  }
  let inputTokens = 0;
  let outputTokens = 0;
  for (const model of Object.values(summary.byModel)) {
    inputTokens += model.inputTokens;
    outputTokens += model.outputTokens;
  }
  return {
    totalTokens: summary.totalTokens,
    inputTokens,
    outputTokens,
    totalCost: summary.totalCost,
  };
}

/**
 * Hook to get cumulative token usage for the current chat session
 */
export function useSessionTokens(sessionId: string | undefined): SessionTokens {
  const [tokens, setTokens] = useState<SessionTokens>({
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalCost: 0,
  });

  useEffect(() => {
    if (!sessionId) {
      queueMicrotask(() => {
        setTokens({
          totalTokens: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalCost: 0,
        });
      });
      return;
    }

    // Get session token usage and set initial state via queueMicrotask
    queueMicrotask(() => {
      setTokens(getUsageFromSummary(sessionId));
    });

    // Poll every 2 seconds for updates
    const interval = setInterval(() => {
      setTokens(getUsageFromSummary(sessionId));
    }, 2000);

    return () => clearInterval(interval);
  }, [sessionId]);

  return tokens;
}
