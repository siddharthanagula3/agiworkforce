
export type McpStartupStatus =
  | { state: 'starting' }
  | { state: 'ready' }
  | { state: 'failed'; error: string }
  | { state: 'cancelled' };
