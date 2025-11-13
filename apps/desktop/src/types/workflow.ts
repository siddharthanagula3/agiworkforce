export interface WorkflowDefinition {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  triggers: WorkflowTrigger[];
  metadata: Record<string, any>;
  created_at: number;
  updated_at: number;
}

export type WorkflowNode =
  | AgentNode
  | DecisionNode
  | LoopNode
  | ParallelNode
  | WaitNode
  | ScriptNode
  | ToolNode;

export interface NodePosition {
  x: number;
  y: number;
}

export interface AgentNode {
  type: 'agent';
  id: string;
  position: NodePosition;
  data: AgentNodeData;
}

export interface AgentNodeData {
  label: string;
  agent_template_id?: string;
  agent_name?: string;
  input_mapping: Record<string, string>;
  output_mapping: Record<string, string>;
  config: Record<string, any>;
}

export interface DecisionNode {
  type: 'decision';
  id: string;
  position: NodePosition;
  data: DecisionNodeData;
}

export interface DecisionNodeData {
  label: string;
  condition: string;
  condition_type: ConditionType;
  true_path?: string;
  false_path?: string;
}

export type ConditionType = 'expression' | 'output_contains' | 'output_equals' | 'custom';

export interface LoopNode {
  type: 'loop';
  id: string;
  position: NodePosition;
  data: LoopNodeData;
}

export interface LoopNodeData {
  label: string;
  loop_type: LoopType;
  iterations?: number;
  condition?: string;
  collection?: string;
  item_variable: string;
}

export type LoopType = 'count' | 'condition' | 'for_each';

export interface ParallelNode {
  type: 'parallel';
  id: string;
  position: NodePosition;
  data: ParallelNodeData;
}

export interface ParallelNodeData {
  label: string;
  branches: string[];
  wait_for_all: boolean;
  timeout_seconds?: number;
}

export interface WaitNode {
  type: 'wait';
  id: string;
  position: NodePosition;
  data: WaitNodeData;
}

export interface WaitNodeData {
  label: string;
  wait_type: WaitType;
  duration_seconds?: number;
  until_time?: number;
  condition?: string;
}

export type WaitType = 'duration' | 'until_time' | 'condition';

export interface ScriptNode {
  type: 'script';
  id: string;
  position: NodePosition;
  data: ScriptNodeData;
}

export interface ScriptNodeData {
  label: string;
  language: ScriptLanguage;
  code: string;
  timeout_seconds?: number;
}

export type ScriptLanguage = 'javascript' | 'python' | 'bash';

export interface ToolNode {
  type: 'tool';
  id: string;
  position: NodePosition;
  data: ToolNodeData;
}

export interface ToolNodeData {
  label: string;
  tool_name: string;
  tool_input: Record<string, any>;
  timeout_seconds?: number;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  source_handle?: string;
  target_handle?: string;
  condition?: string;
  label?: string;
}

export type WorkflowTrigger = ManualTrigger | ScheduledTrigger | EventTrigger | WebhookTrigger;

export interface ManualTrigger {
  type: 'manual';
}

export interface ScheduledTrigger {
  type: 'scheduled';
  cron: string;
  timezone?: string;
}

export interface EventTrigger {
  type: 'event';
  event_type: string;
  filter?: Record<string, any>;
}

export interface WebhookTrigger {
  type: 'webhook';
  url: string;
  method: string;
  auth_token?: string;
}

export type WorkflowStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface WorkflowExecution {
  id: string;
  workflow_id: string;
  status: WorkflowStatus;
  current_node_id?: string;
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  error?: string;
  started_at?: number;
  completed_at?: number;
}

export interface WorkflowExecutionLog {
  id: string;
  execution_id: string;
  node_id: string;
  event_type: LogEventType;
  data?: any;
  timestamp: number;
}

export type LogEventType = 'started' | 'completed' | 'failed' | 'skipped';

export interface ScheduledWorkflow {
  workflow_id: string;
  workflow_name: string;
  trigger_type: string;
  cron_expression?: string;
  next_execution?: number;
  last_execution?: number;
  enabled: boolean;
}

// React Flow specific types
export interface ReactFlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: any;
}

export interface ReactFlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
  animated?: boolean;
  style?: React.CSSProperties;
}

// Node library item for the sidebar
export interface NodeLibraryItem {
  type: string;
  label: string;
  description: string;
  icon: string;
  category: 'control' | 'action' | 'integration';
}
