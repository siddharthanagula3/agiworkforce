
export type AgentEventError = {
  message: string;
  code?: string;
  retryable?: boolean;
  retryAfterSeconds?: number;
};
