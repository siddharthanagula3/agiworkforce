/**
 * Agent session and status tracking types.
 */

/** Possible states of an agent */
export type AgentStatus = 'idle' | 'thinking' | 'working' | 'error';

/** Represents an active agent with its current state */
export interface ActiveAgent {
  id: string;
  name: string;
  status: AgentStatus;
  currentTask?: string;
  progress?: number;
  lastActivity?: Date;
}

/** Task assigned to an agent */
export interface TaskAssignment {
  taskId: string;
  agentId: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

/** Agent session tracking */
export interface AgentSession {
  sessionId: string;
  agentId: string;
  startedAt: Date;
  endedAt?: Date;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
}
