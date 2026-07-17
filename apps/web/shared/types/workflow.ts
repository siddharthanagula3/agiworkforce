/**
 * Workflow types — re-exported from the shared package.
 *
 * Web-specific types (e.g., NodeLibraryItem) are kept here.
 */

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

// ---- Web-specific types ----

export interface NodeLibraryItem {
  type: string;
  label: string;
  description: string;
  icon: string;
  category: 'control' | 'action' | 'integration';
}
