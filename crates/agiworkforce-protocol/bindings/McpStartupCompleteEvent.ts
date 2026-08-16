import type { McpStartupFailure } from './McpStartupFailure';

export type McpStartupCompleteEvent = {
  ready: Array<string>;
  failed: Array<McpStartupFailure>;
  cancelled: Array<string>;
};
