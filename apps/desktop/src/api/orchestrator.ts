import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '../lib/tauri-mock';

export type AgentPriority = 'low' | 'medium' | 'high' | 'critical';

export interface SpawnAgentPayload {
  description: string;
  priority?: AgentPriority;
  deadline?: number;
  successCriteria?: string[];
}

interface SpawnAgentResponse {
  agentId: string;
}

let orchestratorInitialized = false;

async function ensureInit() {
  if (orchestratorInitialized || !isTauri) {
    orchestratorInitialized = true;
    return;
  }

  await invoke('orchestrator_init_default').catch((error) => {
    console.error('[orchestrator] Failed to initialize', error);
    throw error;
  });
  orchestratorInitialized = true;
}

export async function spawnAgent(payload: SpawnAgentPayload): Promise<string> {
  await ensureInit();

  if (!isTauri) {
    console.info('[orchestrator] spawnAgent (mock)', payload);
    return `mock-agent-${Math.random().toString(36).slice(2, 8)}`;
  }

  const response = await invoke<SpawnAgentResponse>('orchestrator_spawn_agent', {
    request: {
      description: payload.description,
      priority: payload.priority,
      deadline: payload.deadline,
      successCriteria: payload.successCriteria,
    },
  });

  return response.agentId;
}

export async function cancelAgent(agentId: string): Promise<void> {
  if (!isTauri) {
    console.info('[orchestrator] cancelAgent (mock)', agentId);
    return;
  }

  await invoke('orchestrator_cancel_agent', { agentId });
}

export async function listAgents() {
  if (!isTauri) {
    return [];
  }

  return invoke('orchestrator_list_agents');
}
