/**
 * Agent API — typed wrappers for agi_*, orchestrator_*, agent_*, background_*, swarm_* commands.
 */

import { command } from '@agiworkforce/runtime';

// ---- Types ----

export interface AGIConfig {
  [key: string]: unknown;
}
export interface SubmitGoalRequest {
  goal: string;
  model?: string;
  tools?: string[];
  [key: string]: unknown;
}
export interface SubmitGoalResponse {
  goalId: string;
  status: string;
}
export interface SubmitParallelGoalRequest {
  goals: SubmitGoalRequest[];
  [key: string]: unknown;
}
export interface SubmitParallelGoalResponse {
  goalIds: string[];
}
export interface GoalStatusResponse {
  goalId: string;
  status: string;
  progress: number;
  result?: unknown;
  error?: string;
}
export interface Goal {
  id: string;
  description: string;
  status: string;
  createdAt: string;
}
export interface OrchestratorInitRequest {
  [key: string]: unknown;
}
export interface SpawnAgentRequest {
  goal: string;
  model?: string;
  tools?: string[];
  [key: string]: unknown;
}
export interface SpawnAgentResponse {
  agentId: string;
}
export interface SpawnParallelAgentsRequest {
  agents: SpawnAgentRequest[];
}
export interface SpawnParallelAgentsResponse {
  agentIds: string[];
}
export interface AgentStatus {
  id: string;
  status: string;
  progress: number;
  currentStep?: string;
  error?: string;
}
export interface AgentResult {
  agentId: string;
  success: boolean;
  result?: unknown;
  error?: string;
}
export interface SystemResourcesResponse {
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
}
export interface KnowledgeEntryResponse {
  id: string;
  content: string;
  source: string;
  score: number;
}
export interface AgentConfig {
  [key: string]: unknown;
}
export interface AgentSubmitTaskRequest {
  task: string;
  model?: string;
  [key: string]: unknown;
}
export interface SubmitTaskResponse {
  taskId: string;
}
export interface TaskStatusResponse {
  taskId: string;
  status: string;
  progress: number;
  result?: unknown;
}
export interface ListTasksResponse {
  tasks: TaskStatusResponse[];
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
export interface PushToBackgroundInput {
  goal: string;
  conversationId?: number;
  [key: string]: unknown;
}
export interface PushResponse {
  agentId: string;
}
export interface ListAgentsResponse {
  agents: BackgroundAgent[];
}
export interface BackgroundAgent {
  id: string;
  goal: string;
  status: string;
  createdAt: string;
  progress: number;
}
export interface TakeOverResponse {
  conversationId?: number;
  messages?: unknown[];
}
export interface BackgroundAgentStats {
  total: number;
  active: number;
  completed: number;
  failed: number;
}
export interface BgSubmitTaskRequest {
  [key: string]: unknown;
}
export interface ListBackgroundTasksRequest {
  status?: string;
  limit?: number;
}
export interface Task {
  id: string;
  status: string;
  type: string;
  progress: number;
  createdAt: string;
  result?: unknown;
}
export interface TaskStats {
  total: number;
  running: number;
  completed: number;
  failed: number;
}
export interface TimeoutStatusResponse {
  taskId: string;
  remainingMs: number;
  extended: boolean;
}
export interface TimeoutConfig {
  defaultMinutes: number;
  maxMinutes: number;
  warningThresholdMs: number;
}
export interface WorkflowDefinition {
  id?: string;
  name: string;
  steps: unknown[];
  [key: string]: unknown;
}
export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: string;
  currentStep: number;
}
export interface WorkflowExecutionLog {
  timestamp: string;
  step: number;
  message: string;
  level: string;
}
export interface SwarmInitRequest {
  [key: string]: unknown;
}
export interface SwarmGoalRequest {
  goal: string;
  agentCount?: number;
  [key: string]: unknown;
}
export interface SwarmResult {
  success: boolean;
  results: unknown[];
}
export interface SwarmStats {
  totalAgents: number;
  activeAgents: number;
  completedTasks: number;
}

// ---- AGI Core ----

export async function agiInit(config: AGIConfig): Promise<void> {
  return command<void>('agi_init', { config });
}
export async function agiCancelGoal(goalId: string): Promise<void> {
  return command<void>('agi_cancel_goal', { goalId });
}
export async function agiSubmitGoal(request: SubmitGoalRequest): Promise<SubmitGoalResponse> {
  return command<SubmitGoalResponse>('agi_submit_goal', { request });
}
export async function agiSubmitGoalParallel(
  request: SubmitParallelGoalRequest,
): Promise<SubmitParallelGoalResponse> {
  return command<SubmitParallelGoalResponse>('agi_submit_goal_parallel', { request });
}
export async function agiGetGoalStatus(goalId: string): Promise<GoalStatusResponse> {
  return command<GoalStatusResponse>('agi_get_goal_status', { goalId });
}
export async function agiListGoals(): Promise<Goal[]> {
  return command<Goal[]>('agi_list_goals');
}
export async function agiStop(): Promise<void> {
  return command<void>('agi_stop');
}

// ---- Orchestrator ----

export async function orchestratorInit(request: OrchestratorInitRequest): Promise<void> {
  return command<void>('orchestrator_init', { request });
}
export async function orchestratorInitDefault(): Promise<void> {
  return command<void>('orchestrator_init_default');
}
export async function orchestratorSpawnAgent(
  request: SpawnAgentRequest,
): Promise<SpawnAgentResponse> {
  return command<SpawnAgentResponse>('orchestrator_spawn_agent', { request });
}
export async function orchestratorSpawnParallel(
  request: SpawnParallelAgentsRequest,
): Promise<SpawnParallelAgentsResponse> {
  return command<SpawnParallelAgentsResponse>('orchestrator_spawn_parallel', { request });
}
export async function orchestratorGetAgentStatus(agentId: string): Promise<AgentStatus | null> {
  return command<AgentStatus | null>('orchestrator_get_agent_status', { agentId });
}
export async function orchestratorListAgents(): Promise<AgentStatus[]> {
  return command<AgentStatus[]>('orchestrator_list_agents');
}
export async function orchestratorCancelAgent(agentId: string): Promise<void> {
  return command<void>('orchestrator_cancel_agent', { agentId });
}
export async function orchestratorCancelAll(): Promise<void> {
  return command<void>('orchestrator_cancel_all');
}
export async function orchestratorWaitAll(): Promise<AgentResult[]> {
  return command<AgentResult[]>('orchestrator_wait_all');
}
export async function orchestratorCleanup(): Promise<number> {
  return command<number>('orchestrator_cleanup');
}
export async function getSystemResources(): Promise<SystemResourcesResponse> {
  return command<SystemResourcesResponse>('get_system_resources');
}
export async function pauseAgent(agentId: string): Promise<void> {
  return command<void>('pause_agent', { agentId });
}
export async function resumeAgent(agentId: string): Promise<void> {
  return command<void>('resume_agent', { agentId });
}
export async function cancelAgent(agentId: string): Promise<void> {
  return command<void>('cancel_agent', { agentId });
}
export async function refreshAgentStatus(): Promise<AgentStatus[]> {
  return command<AgentStatus[]>('refresh_agent_status');
}
export async function queryKnowledge(
  query: string,
  limit: number,
): Promise<KnowledgeEntryResponse[]> {
  return command<KnowledgeEntryResponse[]>('query_knowledge', { query, limit });
}
export async function getRecentKnowledge(limit: number): Promise<KnowledgeEntryResponse[]> {
  return command<KnowledgeEntryResponse[]>('get_recent_knowledge', { limit });
}

// ---- Agent ----

export async function agentInit(config: AgentConfig): Promise<void> {
  return command<void>('agent_init', { config });
}
export async function agentSubmitTask(
  request: AgentSubmitTaskRequest,
): Promise<SubmitTaskResponse> {
  return command<SubmitTaskResponse>('agent_submit_task', { request });
}
export async function agentGetTaskStatus(taskId: string): Promise<TaskStatusResponse> {
  return command<TaskStatusResponse>('agent_get_task_status', { taskId });
}
export async function agentListTasks(): Promise<ListTasksResponse> {
  return command<ListTasksResponse>('agent_list_tasks');
}
export async function agentStop(): Promise<void> {
  return command<void>('agent_stop');
}
export async function agentResolveApproval(
  approvalId: string,
  decision: string,
  trust?: boolean,
  reason?: string,
): Promise<void> {
  return command<void>('agent_resolve_approval', { approvalId, decision, trust, reason });
}
export async function agentSetWorkflowHash(workflowHash?: string): Promise<void> {
  return command<void>('agent_set_workflow_hash', { workflowHash });
}
export async function agentListTrustedWorkflows(): Promise<Record<string, string[]>> {
  return command<Record<string, string[]>>('agent_list_trusted_workflows');
}

// ---- Checkpoints ----

export async function agiCheckpointSave(
  request: SaveCheckpointRequest,
): Promise<CheckpointResponse<Checkpoint>> {
  return command<CheckpointResponse<Checkpoint>>('agi_checkpoint_save', { request });
}
export async function agiCheckpointGetLatest(
  taskId: string,
): Promise<CheckpointResponse<Checkpoint | null>> {
  return command<CheckpointResponse<Checkpoint | null>>('agi_checkpoint_get_latest', { taskId });
}
export async function agiCheckpointGet(
  checkpointId: string,
): Promise<CheckpointResponse<Checkpoint | null>> {
  return command<CheckpointResponse<Checkpoint | null>>('agi_checkpoint_get', { checkpointId });
}
export async function agiCheckpointList(
  request: ListCheckpointsRequest,
): Promise<CheckpointResponse<CheckpointListResponse>> {
  return command<CheckpointResponse<CheckpointListResponse>>('agi_checkpoint_list', { request });
}
export async function agiCheckpointDelete(checkpointId: string): Promise<CheckpointResponse<void>> {
  return command<CheckpointResponse<void>>('agi_checkpoint_delete', { checkpointId });
}

// ---- Background Agents ----

export async function backgroundAgentPush(input: PushToBackgroundInput): Promise<PushResponse> {
  return command<PushResponse>('background_agent_push', { input });
}
export async function backgroundAgentList(): Promise<ListAgentsResponse> {
  return command<ListAgentsResponse>('background_agent_list');
}
export async function backgroundAgentListActive(): Promise<BackgroundAgent[]> {
  return command<BackgroundAgent[]>('background_agent_list_active');
}
export async function backgroundAgentGet(agentId: string): Promise<BackgroundAgent | null> {
  return command<BackgroundAgent | null>('background_agent_get', { agentId });
}
export async function backgroundAgentPause(agentId: string): Promise<void> {
  return command<void>('background_agent_pause', { agentId });
}
export async function backgroundAgentResume(agentId: string): Promise<void> {
  return command<void>('background_agent_resume', { agentId });
}
export async function backgroundAgentCancel(agentId: string): Promise<void> {
  return command<void>('background_agent_cancel', { agentId });
}
export async function backgroundAgentTakeOver(agentId: string): Promise<TakeOverResponse> {
  return command<TakeOverResponse>('background_agent_take_over', { agentId });
}
export async function backgroundAgentStats(): Promise<BackgroundAgentStats> {
  return command<BackgroundAgentStats>('background_agent_stats');
}
export async function backgroundAgentCleanup(): Promise<number> {
  return command<number>('background_agent_cleanup');
}
export async function backgroundAgentShouldPush(goal: string): Promise<[boolean, string]> {
  return command<[boolean, string]>('background_agent_should_push', { goal });
}

// ---- Background Tasks ----

export async function bgSubmitTask(request: BgSubmitTaskRequest): Promise<string> {
  return command<string>('bg_submit_task', { request });
}
export async function bgCancelTask(taskId: string): Promise<void> {
  return command<void>('bg_cancel_task', { taskId });
}
export async function bgPauseTask(taskId: string): Promise<void> {
  return command<void>('bg_pause_task', { taskId });
}
export async function bgResumeTask(taskId: string): Promise<void> {
  return command<void>('bg_resume_task', { taskId });
}
export async function bgGetTaskStatus(taskId: string): Promise<Task> {
  return command<Task>('bg_get_task_status', { taskId });
}
export async function bgListTasks(request: ListBackgroundTasksRequest): Promise<Task[]> {
  return command<Task[]>('bg_list_tasks', { request });
}
export async function bgGetTaskStats(): Promise<TaskStats> {
  return command<TaskStats>('bg_get_task_stats');
}
export async function backgroundTaskList(request: ListBackgroundTasksRequest): Promise<Task[]> {
  return command<Task[]>('background_task_list', { request });
}
export async function backgroundTaskCancel(taskId: string): Promise<void> {
  return command<void>('background_task_cancel', { taskId });
}
export async function backgroundTaskStatus(taskId: string): Promise<Task> {
  return command<Task>('background_task_status', { taskId });
}
export async function agiGetTimeoutStatus(taskId: string): Promise<TimeoutStatusResponse> {
  return command<TimeoutStatusResponse>('agi_get_timeout_status', { taskId });
}
export async function agiExtendTimeout(taskId: string, additionalMinutes: number): Promise<void> {
  return command<void>('agi_extend_timeout', { taskId, additionalMinutes });
}
export async function agiPauseTask(taskId: string): Promise<void> {
  return command<void>('agi_pause_task', { taskId });
}
export async function agiResumeTask(taskId: string): Promise<void> {
  return command<void>('agi_resume_task', { taskId });
}
export async function agiAbortTask(taskId: string): Promise<void> {
  return command<void>('agi_abort_task', { taskId });
}
export async function timeoutGetConfig(): Promise<TimeoutConfig> {
  return command<TimeoutConfig>('timeout_get_config');
}
export async function timeoutSetConfig(config: TimeoutConfig): Promise<void> {
  return command<void>('timeout_set_config', { config });
}
export async function timeoutGetRecommended(taskType: string): Promise<number> {
  return command<number>('timeout_get_recommended', { taskType });
}

// ---- Workflows ----

export async function createWorkflow(definition: WorkflowDefinition): Promise<string> {
  return command<string>('create_workflow', { definition });
}
export async function updateWorkflow(id: string, definition: WorkflowDefinition): Promise<void> {
  return command<void>('update_workflow', { id, definition });
}
export async function deleteWorkflow(id: string): Promise<void> {
  return command<void>('delete_workflow', { id });
}
export async function getWorkflow(id: string): Promise<WorkflowDefinition> {
  return command<WorkflowDefinition>('get_workflow', { id });
}
export async function getUserWorkflows(userId: string): Promise<WorkflowDefinition[]> {
  return command<WorkflowDefinition[]>('get_user_workflows', { userId });
}
export async function executeWorkflow(
  workflowId: string,
  inputs: Record<string, unknown>,
): Promise<string> {
  return command<string>('execute_workflow', { workflowId, inputs });
}
export async function pauseWorkflow(executionId: string): Promise<void> {
  return command<void>('pause_workflow', { executionId });
}
export async function resumeWorkflow(executionId: string): Promise<void> {
  return command<void>('resume_workflow', { executionId });
}
export async function cancelWorkflow(executionId: string): Promise<void> {
  return command<void>('cancel_workflow', { executionId });
}
export async function getWorkflowStatus(executionId: string): Promise<WorkflowExecution> {
  return command<WorkflowExecution>('get_workflow_status', { executionId });
}
export async function getExecutionLogs(executionId: string): Promise<WorkflowExecutionLog[]> {
  return command<WorkflowExecutionLog[]>('get_execution_logs', { executionId });
}
export async function scheduleWorkflow(
  workflowId: string,
  cronExpr: string,
  timezone?: string,
): Promise<void> {
  return command<void>('schedule_workflow', { workflowId, cronExpr, timezone });
}
export async function triggerWorkflowOnEvent(
  workflowId: string,
  eventType: string,
  eventData: Record<string, unknown>,
): Promise<string> {
  return command<string>('trigger_workflow_on_event', { workflowId, eventType, eventData });
}
export async function getNextExecutionTime(cronExpr: string): Promise<number> {
  return command<number>('get_next_execution_time', { cronExpr });
}

// ---- Swarm ----

export async function swarmInit(request: SwarmInitRequest): Promise<void> {
  return command<void>('swarm_init', { request });
}
export async function swarmExecuteGoal(request: SwarmGoalRequest): Promise<SwarmResult> {
  return command<SwarmResult>('swarm_execute_goal', { request });
}
export async function swarmGetStats(): Promise<SwarmStats> {
  return command<SwarmStats>('swarm_get_stats');
}
export async function swarmStop(): Promise<void> {
  return command<void>('swarm_stop');
}
