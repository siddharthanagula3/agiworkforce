// Tauri backend event name constants — single source of truth
// These must match the string literals in Rust emit calls exactly.

export const EVENTS = {
  // AGI goal lifecycle
  AGI_GOAL_PROGRESS: 'agi:goal:progress',
  AGI_GOAL_SUBMITTED: 'agi:goal:submitted',
  AGI_GOAL_CANCELLED: 'agi:goal:cancelled',
  AGI_GOAL_PAUSED: 'agi:goal:paused',
  AGI_GOAL_RESUMED: 'agi:goal:resumed',

  // Agent status
  AGENT_STATUS_UPDATE: 'agent:status:update',
  AGENT_ACTION_UPDATE: 'agent:action_update',
  AGENT_PERMISSION_REQUIRED: 'agent:permission_required',
  AGENT_METRICS: 'agent:metrics',

  // Background agents
  BACKGROUND_AGENT_CREATED: 'background_agent:created',
  BACKGROUND_AGENT_STARTED: 'background_agent:started',
  BACKGROUND_AGENT_PROGRESS: 'background_agent:progress',
  BACKGROUND_AGENT_COMPLETED: 'background_agent:completed',
  BACKGROUND_AGENT_FAILED: 'background_agent:failed',
  BACKGROUND_AGENT_CANCELLED: 'background_agent:cancelled',
  BACKGROUND_AGENT_PAUSED: 'background_agent:paused',
  BACKGROUND_AGENT_RESUMED: 'background_agent:resumed',
  BACKGROUND_AGENT_TAKEN_OVER: 'background_agent:taken_over',

  // Tool and file events
  TOOL_APPROVAL_REQUIRED: 'tool:approval_required',
  FILE_OPERATION_COMPLETE: 'file:operation_complete',

  // Extension events
  EXTENSION_TASK_RESULT: 'extension:task-result',
  EXTENSION_PAGE_CONTEXT: 'extension:page-context',
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];
