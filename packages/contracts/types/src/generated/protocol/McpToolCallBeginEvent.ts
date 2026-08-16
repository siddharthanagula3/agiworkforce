import type { McpInvocation } from './McpInvocation';

export type McpToolCallBeginEvent = {
  call_id: string;
  invocation: McpInvocation;
  mcp_app_resource_uri?: string;
};
