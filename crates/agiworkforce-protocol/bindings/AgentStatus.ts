
export type AgentStatus =
  | 'pending_init'
  | 'running'
  | 'interrupted'
  | { completed: string | null }
  | { errored: string }
  | 'shutdown'
  | 'not_found';
