import type { CallToolResult } from './CallToolResult';
import type { McpInvocation } from './McpInvocation';

export type McpToolCallEndEvent = {
  call_id: string;
  invocation: McpInvocation;
  mcp_app_resource_uri?: string;
  duration: string;
  result: { Ok: CallToolResult } | { Err: string };
};
