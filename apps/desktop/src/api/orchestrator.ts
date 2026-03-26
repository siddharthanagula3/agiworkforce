/**
 * Orchestrator API
 *
 * TypeScript wrappers for the AGI orchestrator Tauri commands.
 * The orchestrator manages multi-agent spawning, lifecycle control,
 * and parallel execution of agent goals.
 *
 * Covered commands (sys/commands/agi.rs):
 *   orchestrator_init_default      — init with defaults (max_agents=4)
 *   orchestrator_init              — init with custom config
 *   orchestrator_spawn_agent       — spawn a single agent
 *   orchestrator_spawn_parallel    — spawn multiple agents in parallel
 *   orchestrator_get_agent_status  — get status of a specific agent
 *   orchestrator_list_agents       — list all active agents
 *   orchestrator_cancel_agent      — cancel a specific agent
 *   orchestrator_cancel_all        — cancel all agents
 *   orchestrator_wait_all          — wait for all agents to finish
 *   orchestrator_cleanup           — clean up completed agents
 *   pause_agent                    — pause a running agent
 *   resume_agent                   — resume a paused agent
 *   cancel_agent                   — cancel agent (alternate entry point)
 *
 * Covered commands (sys/commands/orchestration.rs):
 *   create_workflow               — create a workflow definition
 *   update_workflow               — update an existing workflow
 *   delete_workflow               — delete a workflow
 *   get_workflow                  — get a workflow by ID
 *   get_user_workflows            — list workflows for a user
 *   execute_workflow              — execute a workflow with inputs
 *   pause_workflow                — pause a running execution
 *   resume_workflow               — resume a paused execution
 *   cancel_workflow               — cancel a running execution
 *   get_workflow_status           — get execution status
 *   get_execution_logs            — get logs for an execution
 *   schedule_workflow             — schedule a workflow via cron
 *   trigger_workflow_on_event     — trigger a workflow from an event
 *   get_next_execution_time       — get next scheduled run time
 */

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

/** Agent status as returned by the orchestrator. */
export interface OrchestratorAgentStatus {
  id: string;
  status: string;
  goal?: string;
  progress?: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

/** Result from waiting for all agents to complete. */
export interface AgentResult {
  agentId: string;
  success: boolean;
  result?: string;
  error?: string;
  durationMs?: number;
}

/** AGI configuration for custom orchestrator init. */
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

/**
 * Initialize the orchestrator with custom configuration.
 * Use this instead of ensureInit() when you need non-default settings.
 */
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

/**
 * Spawn multiple agents in parallel, each with its own goal.
 * Returns an array of agent IDs for tracking.
 */
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

/**
 * Get the status of a specific agent by ID.
 */
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

/**
 * Cancel all running agents managed by the orchestrator.
 */
export async function cancelAllAgents(): Promise<void> {
  if (!isTauri) {
    console.debug('[orchestrator] cancelAllAgents (mock)');
    return;
  }

  await invoke('orchestrator_cancel_all');
}

/**
 * Wait for all agents to complete and return their results.
 * This blocks until every agent finishes (success or failure).
 */
export async function waitForAllAgents(): Promise<AgentResult[]> {
  if (!isTauri) {
    console.debug('[orchestrator] waitForAllAgents (mock)');
    return [];
  }

  return invoke<AgentResult[]>('orchestrator_wait_all');
}

/**
 * Clean up completed/failed agents from the orchestrator.
 * Returns the number of agents removed.
 */
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

/**
 * Pause a running agent by ID.
 */
export async function pauseAgent(agentId: string): Promise<void> {
  if (!isTauri) {
    console.debug('[orchestrator] pauseAgent (mock)', agentId);
    return;
  }

  await invoke('pause_agent', { agentId });
}

/**
 * Resume a paused agent by ID.
 */
export async function resumeAgent(agentId: string): Promise<void> {
  if (!isTauri) {
    console.debug('[orchestrator] resumeAgent (mock)', agentId);
    return;
  }

  await invoke('resume_agent', { agentId });
}

// ═══════════════════════════════════════════════════════════════════════════
// Workflow Orchestration (sys/commands/orchestration.rs)
// ═══════════════════════════════════════════════════════════════════════════

// ---------------------------------------------------------------------------
// Types (mirror Rust structs from core/orchestration/workflow_engine.rs)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Workflow CRUD
// ---------------------------------------------------------------------------

/** Create a new workflow definition. Returns the workflow ID. */
export async function createWorkflow(definition: WorkflowDefinition): Promise<string> {
  try {
    return await invoke<string>('create_workflow', { definition });
  } catch (error) {
    throw new Error(`Failed to create workflow: ${error}`);
  }
}

/** Update an existing workflow definition by ID. */
export async function updateWorkflow(id: string, definition: WorkflowDefinition): Promise<void> {
  try {
    await invoke('update_workflow', { id, definition });
  } catch (error) {
    throw new Error(`Failed to update workflow: ${error}`);
  }
}

/** Delete a workflow by ID. */
export async function deleteWorkflow(id: string): Promise<void> {
  try {
    await invoke('delete_workflow', { id });
  } catch (error) {
    throw new Error(`Failed to delete workflow: ${error}`);
  }
}

/** Get a workflow definition by ID. */
export async function getWorkflow(id: string): Promise<WorkflowDefinition> {
  try {
    return await invoke<WorkflowDefinition>('get_workflow', { id });
  } catch (error) {
    throw new Error(`Failed to get workflow: ${error}`);
  }
}

/** List all workflows for a given user. */
export async function getUserWorkflows(userId: string): Promise<WorkflowDefinition[]> {
  try {
    return await invoke<WorkflowDefinition[]>('get_user_workflows', { userId });
  } catch (error) {
    throw new Error(`Failed to get user workflows: ${error}`);
  }
}

// ---------------------------------------------------------------------------
// Workflow Execution
// ---------------------------------------------------------------------------

/**
 * Execute a workflow with the provided input values.
 * Returns the execution ID for tracking.
 */
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

/** Pause a running workflow execution. */
export async function pauseWorkflow(executionId: string): Promise<void> {
  try {
    await invoke('pause_workflow', { executionId });
  } catch (error) {
    throw new Error(`Failed to pause workflow: ${error}`);
  }
}

/** Resume a paused workflow execution. */
export async function resumeWorkflow(executionId: string): Promise<void> {
  try {
    await invoke('resume_workflow', { executionId });
  } catch (error) {
    throw new Error(`Failed to resume workflow: ${error}`);
  }
}

/** Cancel a running workflow execution. */
export async function cancelWorkflow(executionId: string): Promise<void> {
  try {
    await invoke('cancel_workflow', { executionId });
  } catch (error) {
    throw new Error(`Failed to cancel workflow: ${error}`);
  }
}

/** Get the status of a workflow execution. */
export async function getWorkflowStatus(executionId: string): Promise<WorkflowExecution> {
  try {
    return await invoke<WorkflowExecution>('get_workflow_status', { executionId });
  } catch (error) {
    throw new Error(`Failed to get workflow status: ${error}`);
  }
}

/** Get the execution logs for a workflow execution. */
export async function getExecutionLogs(executionId: string): Promise<WorkflowExecutionLog[]> {
  try {
    return await invoke<WorkflowExecutionLog[]>('get_execution_logs', { executionId });
  } catch (error) {
    throw new Error(`Failed to get execution logs: ${error}`);
  }
}

// ---------------------------------------------------------------------------
// Workflow Scheduling
// ---------------------------------------------------------------------------

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

/**
 * Trigger a workflow in response to an event.
 * Returns the execution ID.
 */
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

/** Get the next scheduled execution time for a cron expression (epoch seconds). */
export async function getNextExecutionTime(cronExpr: string): Promise<number> {
  try {
    return await invoke<number>('get_next_execution_time', { cronExpr });
  } catch (error) {
    throw new Error(`Failed to get next execution time: ${error}`);
  }
}
