
export type AgentTaskState =
  | 'queued'
  | 'running'
  | 'awaiting_input'
  | 'ready_for_review'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'paused'
  | 'archived';
