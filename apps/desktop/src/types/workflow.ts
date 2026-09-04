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
