
export const EVENTS = {
  AGI_GOAL_PROGRESS: 'agi:goal:progress',
  AGI_GOAL_SUBMITTED: 'agi:goal:submitted',
  AGI_GOAL_CANCELLED: 'agi:goal:cancelled',
  AGI_GOAL_PAUSED: 'agi:goal:paused',
  AGI_GOAL_RESUMED: 'agi:goal:resumed',

  AGENT_STATUS_UPDATE: 'agent:status:update',
  AGENT_ACTION_UPDATE: 'agent:action_update',
  AGENT_PERMISSION_REQUIRED: 'agent:permission_required',
  AGENT_METRICS: 'agent:metrics',

  BACKGROUND_AGENT_CREATED: 'background_agent:created',
  BACKGROUND_AGENT_STARTED: 'background_agent:started',
  BACKGROUND_AGENT_PROGRESS: 'background_agent:progress',
  BACKGROUND_AGENT_COMPLETED: 'background_agent:completed',
  BACKGROUND_AGENT_FAILED: 'background_agent:failed',
  BACKGROUND_AGENT_CANCELLED: 'background_agent:cancelled',
  BACKGROUND_AGENT_PAUSED: 'background_agent:paused',
  BACKGROUND_AGENT_RESUMED: 'background_agent:resumed',
  BACKGROUND_AGENT_TAKEN_OVER: 'background_agent:taken_over',

  TOOL_APPROVAL_REQUIRED: 'tool:approval_required',
  FILE_OPERATION_COMPLETE: 'file:operation_complete',

  EXTENSION_TASK_RESULT: 'extension:task-result',
  EXTENSION_PAGE_CONTEXT: 'extension:page-context',

  CHAT_CONTEXT_COMPACTED: 'chat:context-compacted',
  COMPACTION_AUTO_TRIGGERED: 'compaction:auto-triggered',
  COMPACTION_COMPLETED: 'compaction:completed',
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];
