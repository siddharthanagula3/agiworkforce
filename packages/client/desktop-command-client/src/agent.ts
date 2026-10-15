import { command } from '@agiworkforce/client-runtime';
import type { AgentConfig } from '@agiworkforce/types';

export type { AgentConfig };

export interface Goal {
  id: string;
  description: string;
  status: string;
  createdAt: string;
}
export interface AgentStatus {
  id: string;
  status: string;
  progress: number;
  currentStep?: string;
  error?: string;
}
export interface SaveCheckpointRequest {
  taskId: string;
  data: unknown;
}
export interface Checkpoint {
  id: string;
  taskId: string;
  data: unknown;
  createdAt: string;
}
export interface CheckpointResponse<T> {
  success: boolean;
  data: T;
}
export interface CheckpointListResponse {
  checkpoints: Checkpoint[];
  total: number;
}
export interface ListCheckpointsRequest {
  taskId: string;
  limit?: number;
}

export async function agentSetWorkflowHash(workflowHash?: string): Promise<void> {
  return command<void>('agent_set_workflow_hash', { workflowHash });
}
