
import type { OAuthClientProvider } from '@modelcontextprotocol/client';

export interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string | number | boolean>;
  cwd?: string;
  url?: string;
  transport?: 'sse' | 'streamable-http';
  headers?: Record<string, string | number | boolean>;
  authProvider?: OAuthClientProvider;
  connectionTimeoutMs?: number;
  signedManifest?: boolean;
  userConsent?: {
    granted_at: string;
    for_command: string;
    for_args?: string[];
  };
  developerMode?: boolean;
}

export interface McpCatalogTool {
  serverName: string;
  safeServerName: string;
  toolName: string;
  title?: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  fallbackDescription: string;
}

export interface McpServerCatalog {
  serverName: string;
  safeServerName: string;
  tools: McpCatalogTool[];
}

export interface McpToolCatalog {
  version: number;
  generatedAt: number;
  servers: Record<string, McpServerCatalog>;
  tools: McpCatalogTool[];
}

export interface McpCallToolResult {
  isError?: boolean;
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; data: string; mimeType: string }
    | { type: 'resource'; resource: { uri: string; mimeType?: string; text?: string } }
  >;
}
