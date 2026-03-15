/**
 * Workflow types — re-exported from the shared package.
 *
 * Desktop-specific React Flow types are kept here; core workflow
 * contracts live in @agiworkforce/types.
 */

// Re-export all shared workflow types
export type {
  WorkflowDefinition,
  WorkflowNode,
  NodePosition,
  AgentNode,
  AgentNodeData,
  DecisionNode,
  DecisionNodeData,
  ConditionType,
  LoopNode,
  LoopNodeData,
  LoopType,
  ParallelNode,
  ParallelNodeData,
  WaitNode,
  WaitNodeData,
  WaitType,
  ScriptNode,
  ScriptNodeData,
  ScriptLanguage,
  ToolNode,
  ToolNodeData,
  WorkflowEdge,
  WorkflowTrigger,
  ManualTrigger,
  ScheduledTrigger,
  EventTrigger,
  WebhookTrigger,
  WorkflowStatus,
  WorkflowExecution,
  WorkflowLogData,
  WorkflowExecutionLog,
  LogEventType,
  ScheduledWorkflow,
} from '@agiworkforce/types';

// ---- Desktop-specific React Flow types ----

export interface ReactFlowNodeData {
  label: string;
  [key: string]: unknown;
}

export interface ReactFlowNode<T extends ReactFlowNodeData = ReactFlowNodeData> {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: T;
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

export interface NodeLibraryItem {
  type: string;
  label: string;
  description: string;
  icon: string;
  category: 'control' | 'action' | 'integration';
}
