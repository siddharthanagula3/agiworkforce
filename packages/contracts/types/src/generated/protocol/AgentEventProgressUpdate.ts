import type { AgentEventProgressStatus } from './AgentEventProgressStatus';

export type AgentEventProgressUpdate = {
  progressId: string;
  summary: string;
  detail?: string;
  status: AgentEventProgressStatus;
};
