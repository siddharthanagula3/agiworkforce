import type { McpStartupStatus } from './McpStartupStatus';

export type McpStartupUpdateEvent = {
  server: string;
  status: McpStartupStatus;
};
