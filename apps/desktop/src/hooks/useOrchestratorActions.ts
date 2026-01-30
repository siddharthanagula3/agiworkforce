import { useCallback, useEffect, useRef, useState } from 'react';
import {
  spawnAgent,
  cancelAgent as tauriCancelAgent,
  type SpawnAgentPayload,
} from '../api/orchestrator';

export interface UseOrchestratorActionsResult {
  spawnAgent: (payload: SpawnAgentPayload) => Promise<string>;
  cancelAgent: (agentId: string) => Promise<void>;
  isSubmitting: boolean;
  lastAgentId?: string;
  error?: string;
}

export function useOrchestratorActions(): UseOrchestratorActionsResult {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastAgentId, setLastAgentId] = useState<string>();
  const [error, setError] = useState<string>();
  // AUDIT-007-007 fix: Track mounted state to prevent setState after unmount
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleSpawn = useCallback(async (payload: SpawnAgentPayload) => {
    // AUDIT-007-007 fix: Check isMounted before setState calls
    if (isMountedRef.current) {
      setIsSubmitting(true);
      setError(undefined);
    }
    try {
      const agentId = await spawnAgent(payload);
      if (isMountedRef.current) {
        setLastAgentId(agentId);
      }
      return agentId;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isMountedRef.current) {
        setError(message);
      }
      throw err;
    } finally {
      if (isMountedRef.current) {
        setIsSubmitting(false);
      }
    }
  }, []);

  const handleCancel = useCallback(async (agentId: string) => {
    // AUDIT-007-007 fix: Check isMounted before setState
    if (isMountedRef.current) {
      setError(undefined);
    }
    await tauriCancelAgent(agentId);
  }, []);

  return {
    spawnAgent: handleSpawn,
    cancelAgent: handleCancel,
    isSubmitting,
    lastAgentId,
    error,
  };
}
