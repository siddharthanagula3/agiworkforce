
import { invoke, isTauri } from '../lib/tauri-mock';

export type AgentPriority = 'low' | 'medium' | 'high' | 'critical';

export interface SpawnAgentPayload {
  description: string;
  priority?: AgentPriority;
  deadline?: number;
  successCriteria?: string[];
  maxSteps?: number;
}

interface SpawnAgentResponse {
  agentId: string;
}

interface SpawnParallelAgentsResponse {
  agentIds: string[];
}

export interface OrchestratorAgentStatus {
  id: string;
  status: string;
  goal?: string;
  progress?: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

export interface AgentResult {
  agentId: string;
  success: boolean;
  result?: string;
  error?: string;
  durationMs?: number;
}

export interface AGIConfig {
  maxIterations?: number;
  timeoutSecs?: number;
  enableReflection?: boolean;
  enableSwarm?: boolean;
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

export async function orchestratorInit(maxAgents: number, config?: AGIConfig): Promise<void> {
  if (!isTauri) {
    console.debug('[orchestrator] orchestratorInit (mock)', { maxAgents, config });
    orchestratorInitialized = true;
    return;
  }

  await invoke('orchestrator_init', {
    request: {
      maxAgents,
      config: config ?? {},
    },
  });
  orchestratorInitialized = true;
}

export async function spawnAgent(payload: SpawnAgentPayload): Promise<string> {
  await ensureInit();

  if (!isTauri) {
    console.debug('[orchestrator] spawnAgent (mock)', payload);
    return `mock-agent-${Math.random().toString(36).slice(2, 8)}`;
  }

  const response = await invoke<SpawnAgentResponse>('orchestrator_spawn_agent', {
    request: {
      description: payload.description,
      priority: payload.priority,
      deadline: payload.deadline,
      successCriteria: payload.successCriteria,
      maxSteps: payload.maxSteps,
    },
  });

  return response.agentId;
}

export async function spawnParallelAgents(goals: SpawnAgentPayload[]): Promise<string[]> {
  await ensureInit();

  if (!isTauri) {
    console.debug('[orchestrator] spawnParallelAgents (mock)', goals);
    return goals.map(() => `mock-agent-${Math.random().toString(36).slice(2, 8)}`);
  }

  const response = await invoke<SpawnParallelAgentsResponse>('orchestrator_spawn_parallel', {
    request: {
      goals: goals.map((g) => ({
        description: g.description,
        priority: g.priority,
        deadline: g.deadline,
        successCriteria: g.successCriteria,
        maxSteps: g.maxSteps,
      })),
    },
  });

  return response.agentIds;
}

export async function getAgentStatus(agentId: string): Promise<OrchestratorAgentStatus | null> {
  if (!isTauri) {
    console.debug('[orchestrator] getAgentStatus (mock)', agentId);
    return null;
  }

  return invoke<OrchestratorAgentStatus | null>('orchestrator_get_agent_status', { agentId });
}

export async function cancelAgent(agentId: string): Promise<void> {
  if (!isTauri) {
    console.debug('[orchestrator] cancelAgent (mock)', agentId);
    return;
  }

  await invoke('orchestrator_cancel_agent', { agentId });
}

export async function cancelAllAgents(): Promise<void> {
  if (!isTauri) {
    console.debug('[orchestrator] cancelAllAgents (mock)');
    return;
  }

  await invoke('orchestrator_cancel_all');
}

export async function waitForAllAgents(): Promise<AgentResult[]> {
  if (!isTauri) {
    console.debug('[orchestrator] waitForAllAgents (mock)');
    return [];
  }

  return invoke<AgentResult[]>('orchestrator_wait_all');
}

export async function cleanupAgents(): Promise<number> {
  if (!isTauri) {
    console.debug('[orchestrator] cleanupAgents (mock)');
    return 0;
  }

  return invoke<number>('orchestrator_cleanup');
}

export async function listAgents(): Promise<OrchestratorAgentStatus[]> {
  if (!isTauri) {
    return [];
  }

  return invoke<OrchestratorAgentStatus[]>('orchestrator_list_agents');
}

export async function pauseAgent(agentId: string): Promise<void> {
  if (!isTauri) {
    console.debug('[orchestrator] pauseAgent (mock)', agentId);
    return;
  }

  await invoke('pause_agent', { agentId });
}

export async function resumeAgent(agentId: string): Promise<void> {
  if (!isTauri) {
    console.debug('[orchestrator] resumeAgent (mock)', agentId);
    return;
  }

  await invoke('resume_agent', { agentId });
}

export interface NodePosition {
  x: number;
  y: number;
}

export interface AgentNodeData {
  label: string;
  agentTemplateId?: string;
  agentName?: string;
  inputMapping: Record<string, string>;
  outputMapping: Record<string, string>;
  config: Record<string, unknown>;
}

export interface DecisionNodeData {
  label: string;
  condition: string;
  conditionType: 'expression' | 'json_path' | 'regex' | 'custom';
  truePath?: string;
  falsePath?: string;
}

export interface LoopNodeData {
  label: string;
  loopType: 'count' | 'while_condition' | 'for_each';
  iterations?: number;
  condition?: string;
  collection?: string;
  itemVariable: string;
}

export type WorkflowNode =
  | { type: 'agent'; id: string; position: NodePosition; data: AgentNodeData }
  | { type: 'decision'; id: string; position: NodePosition; data: DecisionNodeData }
  | { type: 'loop'; id: string; position: NodePosition; data: LoopNodeData };

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  condition?: string;
  label?: string;
}

export type WorkflowTrigger =
  | { type: 'manual' }
  | { type: 'scheduled'; cron: string; timezone?: string }
  | { type: 'event'; eventType: string; filter?: Record<string, unknown> }
  | { type: 'webhook'; url: string };

export interface WorkflowDefinition {
  id: string;
  userId: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  triggers: WorkflowTrigger[];
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export type WorkflowStatus =
  | 'Pending'
  | 'Running'
  | 'WaitingApproval'
  | 'Paused'
  | 'Completed'
  | 'Failed'
  | 'Cancelled';

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: WorkflowStatus;
  currentNodeId?: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export type LogEventType = 'started' | 'completed' | 'failed' | 'skipped';

export interface WorkflowExecutionLog {
  id: string;
  executionId: string;
  nodeId: string;
  eventType: LogEventType;
  data?: unknown;
  timestamp: number;
}

export async function createWorkflow(definition: WorkflowDefinition): Promise<string> {
  try {
    return await invoke<string>('create_workflow', { definition });
  } catch (error) {
    throw new Error(`Failed to create workflow: ${error}`);
  }
}

export async function updateWorkflow(id: string, definition: WorkflowDefinition): Promise<void> {
  try {
    await invoke('update_workflow', { id, definition });
  } catch (error) {
    throw new Error(`Failed to update workflow: ${error}`);
  }
}

export async function deleteWorkflow(id: string): Promise<void> {
  try {
    await invoke('delete_workflow', { id });
  } catch (error) {
    throw new Error(`Failed to delete workflow: ${error}`);
  }
}

export async function getWorkflow(id: string): Promise<WorkflowDefinition> {
  try {
    return await invoke<WorkflowDefinition>('get_workflow', { id });
  } catch (error) {
    throw new Error(`Failed to get workflow: ${error}`);
  }
}

export async function getUserWorkflows(userId: string): Promise<WorkflowDefinition[]> {
  try {
    return await invoke<WorkflowDefinition[]>('get_user_workflows', { userId });
  } catch (error) {
    throw new Error(`Failed to get user workflows: ${error}`);
  }
}

export async function executeWorkflow(
  workflowId: string,
  inputs: Record<string, unknown>,
): Promise<string> {
  try {
    return await invoke<string>('execute_workflow', { workflowId, inputs });
  } catch (error) {
    throw new Error(`Failed to execute workflow: ${error}`);
  }
}

export async function pauseWorkflow(executionId: string): Promise<void> {
  try {
    await invoke('pause_workflow', { executionId });
  } catch (error) {
    throw new Error(`Failed to pause workflow: ${error}`);
  }
}

export async function resumeWorkflow(executionId: string): Promise<void> {
  try {
    await invoke('resume_workflow', { executionId });
  } catch (error) {
    throw new Error(`Failed to resume workflow: ${error}`);
  }
}

export async function cancelWorkflow(executionId: string): Promise<void> {
  try {
    await invoke('cancel_workflow', { executionId });
  } catch (error) {
    throw new Error(`Failed to cancel workflow: ${error}`);
  }
}

export async function getWorkflowStatus(executionId: string): Promise<WorkflowExecution> {
  try {
    return await invoke<WorkflowExecution>('get_workflow_status', { executionId });
  } catch (error) {
    throw new Error(`Failed to get workflow status: ${error}`);
  }
}

export async function getExecutionLogs(executionId: string): Promise<WorkflowExecutionLog[]> {
  try {
    return await invoke<WorkflowExecutionLog[]>('get_execution_logs', { executionId });
  } catch (error) {
    throw new Error(`Failed to get execution logs: ${error}`);
  }
}

/**
 * Schedule a workflow to run on a cron expression.
 * @param workflowId - ID of the workflow to schedule
 * @param cronExpr - cron expression (e.g. "0 9 * * *")
 * @param timezone - optional IANA timezone (e.g. "America/New_York")
 */
export async function scheduleWorkflow(
  workflowId: string,
  cronExpr: string,
  timezone?: string,
): Promise<void> {
  try {
    await invoke('schedule_workflow', { workflowId, cronExpr, timezone });
  } catch (error) {
    throw new Error(`Failed to schedule workflow: ${error}`);
  }
}

export async function triggerWorkflowOnEvent(
  workflowId: string,
  eventType: string,
  eventData: Record<string, unknown>,
): Promise<string> {
  try {
    return await invoke<string>('trigger_workflow_on_event', {
      workflowId,
      eventType,
      eventData,
    });
  } catch (error) {
    throw new Error(`Failed to trigger workflow on event: ${error}`);
  }
}

export async function getNextExecutionTime(cronExpr: string): Promise<number> {
  try {
    return await invoke<number>('get_next_execution_time', { cronExpr });
  } catch (error) {
    throw new Error(`Failed to get next execution time: ${error}`);
  }
}
