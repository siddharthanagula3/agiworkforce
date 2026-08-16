import type { AgentTaskState } from './AgentTaskState';

export type AgentTaskStateChanged = {
  taskId: string;
  state: AgentTaskState;
  previousState?: AgentTaskState;
  summary?: string;
};
