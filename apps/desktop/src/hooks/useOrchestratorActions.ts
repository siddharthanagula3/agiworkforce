import { useCallback, useState } from 'react';
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

  const handleSpawn = useCallback(async (payload: SpawnAgentPayload) => {
    setIsSubmitting(true);
    setError(undefined);
    try {
      const agentId = await spawnAgent(payload);
      setLastAgentId(agentId);
      return agentId;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const handleCancel = useCallback(async (agentId: string) => {
    setError(undefined);
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
