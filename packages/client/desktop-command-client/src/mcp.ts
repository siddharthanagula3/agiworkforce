import { command } from '@agiworkforce/client-runtime';

export interface McpServerInfo {
  name: string;
  status: string;
  transport: string;
  toolCount: number;
}

export const MCP_ELICITATION_REQUEST_EVENT = 'mcp:elicitation-request';
export const MCP_ELICITATION_RESOLVED_EVENT = 'mcp:elicitation-resolved';

export interface McpElicitationPrompt {
  id: string;
  serverName: string;
  message: string;
  mode: 'form' | 'url';
  requestedSchema: unknown;
  url?: string;
  urlHost?: string;
  urlHostIsPunycode: boolean;
  expiresAtMs: number;
}

export interface McpElicitationResolved {
  id: string;
  serverName: string;
  outcome: 'accepted' | 'declined' | 'cancelled' | 'timed_out';
}

export type McpElicitationAnswer =
  | { id: string; action: 'accept'; content?: Record<string, unknown> }
  | { id: string; action: 'decline' | 'cancel' };

export async function mcpRespondElicitation(answer: McpElicitationAnswer): Promise<void> {
  return command<void>('mcp_respond_elicitation', { answer });
}

export async function mcpOpenElicitationUrl(id: string): Promise<void> {
  return command<void>('mcp_open_elicitation_url', { id });
}

export async function mcpListPendingElicitations(): Promise<McpElicitationPrompt[]> {
  return command<McpElicitationPrompt[]>('mcp_list_pending_elicitations');
}

export async function mcpSetServerSandbox(name: string, sandboxed: boolean): Promise<void> {
  return command<void>('mcp_set_server_sandbox', { name, sandboxed });
}
